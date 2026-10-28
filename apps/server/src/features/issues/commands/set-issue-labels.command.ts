import { labelsChange } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { issueKeyParamsSchema, issueLabelsRequestSchema } from '@toppo-tracker/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';

const { issueLabels, issues, labels } = schema;

/**
 * Gives an issue exactly the labels asked for (`issue.update`), labels of the instance only. One
 * activity tells those it gains and loses, by the names they have now; nothing changes, nothing
 * is told.
 */
export const setIssueLabels = defineCommand({
  name: 'issue.setLabels',
  access: { project: 'issueKey', permission: 'issue.update' },
  input: issueKeyParamsSchema.extend(issueLabelsRequestSchema.shape),
  async handler({ tx, actor, project, log }, { labelIds }): Promise<void> {
    const { issue } = project;
    // The issue locked: two changes of its labels apply one after the other.
    await tx.select({ id: issues.id }).from(issues).where(eq(issues.id, issue.id)).for('update');
    const current = await tx
      .select({ id: labels.id, name: labels.name })
      .from(issueLabels)
      .innerJoin(labels, eq(labels.id, issueLabels.labelId))
      .where(eq(issueLabels.issueId, issue.id));
    // Share-locked: a label cannot be deleted while it is being given.
    const requested =
      labelIds.length === 0
        ? []
        : await tx
            .select({ id: labels.id, name: labels.name })
            .from(labels)
            .where(inArray(labels.id, labelIds))
            .for('share');
    if (requested.length !== labelIds.length) {
      throw new HttpError(400, 'INVALID_LABEL', 'This label does not exist');
    }
    const change = labelsChange(
      current.map(({ id }) => id),
      labelIds,
    );
    if (!change) {
      return;
    }
    if (change.removed.length > 0) {
      await tx
        .delete(issueLabels)
        .where(
          and(eq(issueLabels.issueId, issue.id), inArray(issueLabels.labelId, change.removed)),
        );
    }
    if (change.added.length > 0) {
      await tx
        .insert(issueLabels)
        .values(change.added.map((labelId) => ({ issueId: issue.id, labelId })));
    }
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, issue.id));
    const named = (ids: readonly string[], among: readonly { id: string; name: string }[]) =>
      ids.flatMap((id) => among.filter((label) => label.id === id));
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      ...activity('issue.labelsChanged', {
        added: named(change.added, requested),
        removed: named(change.removed, current),
      }),
    });
    log.info({ issueId: issue.id, ...change, by: actor.id }, 'Issue labels changed');
  },
});
