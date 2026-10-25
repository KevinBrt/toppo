import { labelsChange } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  type BulkIssuesResponse,
  bulkLabelsRequestSchema,
  projectIssuesParamsSchema,
} from '@toppo/shared';
import { and, inArray, sql } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { activity } from '../../utils/activities.util.ts';
import { bulkOutcome, issuesToChange } from '../../utils/bulk-issues.util.ts';

const { issueLabels, issues, labels } = schema;

/**
 * Adds labels to several issues of a project and takes others off, labels of the instance only:
 * one activity for each issue that gains or loses one, told as if labelled alone.
 */
export const bulkLabelIssues = defineCommand({
  name: 'issue.bulkLabel',
  access: { project: 'projectKey', permission: 'issue.update' },
  input: projectIssuesParamsSchema.extend(bulkLabelsRequestSchema.shape),
  async handler(
    { tx, actor, project, log },
    { issueKeys, add, remove },
  ): Promise<BulkIssuesResponse> {
    const asked = [...new Set([...add, ...remove])];
    // Share-locked: a label cannot be deleted while it is being given.
    const named =
      asked.length === 0
        ? []
        : await tx
            .select({ id: labels.id, name: labels.name })
            .from(labels)
            .where(inArray(labels.id, asked))
            .for('share');
    if (named.length !== asked.length) {
      throw new HttpError(400, 'INVALID_LABEL', 'This label does not exist');
    }
    const { found, missing } = await issuesToChange(tx, actor, project, issueKeys);
    const current =
      found.length === 0
        ? []
        : await tx
            .select({ issueId: issueLabels.issueId, labelId: issueLabels.labelId })
            .from(issueLabels)
            .where(
              inArray(
                issueLabels.issueId,
                found.map(({ id }) => id),
              ),
            );
    const changes = found.flatMap((issue) => {
      const had = current
        .filter(({ issueId }) => issueId === issue.id)
        .map(({ labelId }) => labelId);
      const kept = had.filter((id) => !remove.includes(id));
      const change = labelsChange(had, [...kept, ...add.filter((id) => !kept.includes(id))]);
      return change ? [{ issue, ...change }] : [];
    });
    if (changes.length === 0) {
      return bulkOutcome(issueKeys, [], [], missing);
    }

    const changedIds = changes.map(({ issue }) => issue.id);
    if (remove.length > 0) {
      await tx
        .delete(issueLabels)
        .where(and(inArray(issueLabels.issueId, changedIds), inArray(issueLabels.labelId, remove)));
    }
    const given = changes.flatMap(({ issue, added }) =>
      added.map((labelId) => ({ issueId: issue.id, labelId })),
    );
    if (given.length > 0) {
      await tx.insert(issueLabels).values(given);
    }
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(inArray(issues.id, changedIds));
    const namesOf = (ids: readonly string[]) =>
      ids.flatMap((id) => named.filter((label) => label.id === id));
    await recordActivities(
      tx,
      changes.map(({ issue, added, removed }) => ({
        projectId: project.id,
        issueId: issue.id,
        actorId: actor.id,
        ...activity('issue.labelsChanged', { added: namesOf(added), removed: namesOf(removed) }),
      })),
    );
    log.info(
      { projectId: project.id, add, remove, changed: changes.length, by: actor.id },
      'Issues labelled',
    );
    return bulkOutcome(
      issueKeys,
      changes.map(({ issue }) => issue),
      [],
      missing,
    );
  },
});
