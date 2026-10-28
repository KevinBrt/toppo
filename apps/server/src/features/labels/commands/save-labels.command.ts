import { type OptionsPlan, planOptions } from '@toppo-tracker/core';
import { isUniqueViolation, schema, uuidv7 } from '@toppo-tracker/db';
import {
  type IssueActivityPayload,
  type LabelDraft,
  labelsRequestSchema,
} from '@toppo-tracker/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { issueLabels, issues, labels } = schema;

/** Rows written at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

type LabelsPlan = OptionsPlan<Omit<LabelDraft, 'id'>>;

/**
 * Saves the whole list of labels at once, as the settings edit it: renamed, recolored, added
 * to, and deleted when named so. A deleted label leaves its issues, each told in its history,
 * which keeps the label's name.
 */
export const saveLabels = defineCommand({
  name: 'label.saveAll',
  access: { permission: 'instance.settings.manage' },
  input: labelsRequestSchema,
  async handler({ tx, actor, log }, { labels: requested, removed }): Promise<void> {
    // Every label locked until the transaction ends: two saves apply one after the other, and an
    // issue given a label being deleted waits, then finds it gone.
    const stored = await tx
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .for('update');
    const plan = planOptions(
      stored.map(({ id }) => id),
      requested,
      removed,
    );
    if (!plan) {
      throw new HttpError(409, 'LABELS_CHANGED', 'The labels changed meanwhile');
    }
    const takenOff = await takeOff(tx, actor.id, plan.removed);
    try {
      await keepAndAdd(tx, plan, stored);
    } catch (error) {
      // The forms compare names in lower case as JavaScript does; PostgreSQL has the last word.
      if (isUniqueViolation(error, 'labels_name_unique')) {
        throw new HttpError(409, 'LABEL_NAME_TAKEN', 'Two labels would share a name');
      }
      throw error;
    }
    log.info(
      { by: actor.id, added: plan.added.length, removed: plan.removed.length, takenOff },
      'Labels saved',
    );
  },
});

/** Deletes labels, telling each issue that had some; answers how many issues lost one. */
async function takeOff(
  tx: Transaction,
  actorId: string,
  removed: readonly string[],
): Promise<number> {
  if (removed.length === 0) {
    return 0;
  }
  const tags = await tx
    .select({
      issueId: issueLabels.issueId,
      projectId: issues.projectId,
      label: { id: labels.id, name: labels.name },
    })
    .from(issueLabels)
    .innerJoin(issues, eq(issues.id, issueLabels.issueId))
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.labelId, [...removed]))
    .orderBy(issueLabels.issueId, sql`lower(${labels.name})`);
  const byIssue = new Map<string, { projectId: string; removed: { id: string; name: string }[] }>();
  for (const { issueId, projectId, label } of tags) {
    const issue = byIssue.get(issueId) ?? { projectId, removed: [] };
    issue.removed.push(label);
    byIssue.set(issueId, issue);
  }
  // Their issues lose them too (`issue_labels` cascades).
  await tx.delete(labels).where(inArray(labels.id, [...removed]));
  const lost = [...byIssue.entries()];
  for (let start = 0; start < lost.length; start += BATCH) {
    const batch = lost.slice(start, start + BATCH);
    await tx
      .update(issues)
      .set({ updatedAt: sql`now()` })
      .where(
        inArray(
          issues.id,
          batch.map(([issueId]) => issueId),
        ),
      );
    // Recorded on each issue, told to nobody: an administrator tidying the labels.
    await recordActivities(
      tx,
      batch.map(([issueId, { projectId, removed: names }]) => {
        const payload: IssueActivityPayload<'issue.labelsChanged'> = {
          added: [],
          removed: names,
        };
        return { projectId, issueId, actorId, type: 'issue.labelsChanged' as const, payload };
      }),
      { notify: false },
    );
  }
  return lost.length;
}

async function keepAndAdd(
  tx: Transaction,
  { kept, added }: LabelsPlan,
  stored: readonly { id: string; name: string; color: string }[],
): Promise<void> {
  const changed = kept.filter(({ id, name, color }) => {
    const before = stored.find((label) => label.id === id);
    return before?.name !== name || before.color !== color;
  });
  const renamed = changed.filter(
    ({ id, name }) => stored.find((label) => label.id === id)?.name !== name,
  );
  // Names are unique, checked row by row: the renamed labels first give theirs up, so that two
  // of them can swap names, then take their new ones.
  if (renamed.length > 0) {
    await tx
      .update(labels)
      .set({ name: sql`${labels.id}::text` })
      .where(
        inArray(
          labels.id,
          renamed.map(({ id }) => id),
        ),
      );
  }
  for (const { id, name, color } of changed) {
    await tx.update(labels).set({ name, color }).where(eq(labels.id, id));
  }
  if (added.length > 0) {
    await tx.insert(labels).values(added.map(({ name, color }) => ({ id: uuidv7(), name, color })));
  }
}
