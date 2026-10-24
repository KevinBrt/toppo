import {
  actionsFor,
  type IssueChange,
  type IssueFields,
  issueActionsOf,
  issueChanges,
  priorityLevelOf,
} from '@toppo/core';
import { schema } from '@toppo/db';
import { issueKeyParamsSchema, updateIssueFieldsSchema } from '@toppo/shared';
import { eq, inArray } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';
import { rememberWords } from '../utils/issue-search.util.ts';

const { issueCategories, issues, priorities } = schema;

/**
 * Changes an issue's title, description, category or priority: only the fields given, and one
 * activity for each that really changes. Whoever reported the issue may change its words; the rest
 * needs `issue.update`.
 */
export const updateIssue = defineCommand({
  name: 'issue.update',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema.extend(updateIssueFieldsSchema.partial().shape),
  async handler({ tx, actor, project, log }, { issueKey: _key, ...requested }): Promise<void> {
    // Locked: changes made at the same time apply one after the other, each from the last.
    const [current] = await tx
      .select({
        title: issues.title,
        description: issues.description,
        categoryId: issues.categoryId,
        priorityId: issues.priorityId,
      })
      .from(issues)
      .where(eq(issues.id, project.issue.id))
      .for('update');
    if (!current) {
      throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
    }
    const changes = issueChanges(current, requested);
    const allowed = issueActionsOf(project.permissions, project.issue.reportedByActor);
    if (actionsFor(changes).some((action) => !allowed.includes(action))) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to change this');
    }
    if (changes.length === 0) {
      return;
    }

    const recorded = await Promise.all(changes.map((change) => activityOf(tx, change)));
    const values: Partial<IssueFields> = {};
    for (const { field, to } of changes) {
      values[field] = to;
    }
    await tx.update(issues).set(values).where(eq(issues.id, project.issue.id));
    if (changes.some(({ field }) => field === 'title' || field === 'description')) {
      await rememberWords(tx, project.issue.id);
    }
    await recordActivities(
      tx,
      recorded.map((entry) => ({
        projectId: project.id,
        issueId: project.issue.id,
        actorId: actor.id,
        ...entry,
      })),
    );
    log.info(
      { issueId: project.issue.id, fields: changes.map(({ field }) => field), by: actor.id },
      'Issue updated',
    );
  },
});

/** The activity recording a change, with the names categories and priorities have now. */
async function activityOf(tx: Transaction, change: IssueChange) {
  switch (change.field) {
    case 'title':
      return activity('issue.titleChanged', { from: change.from, to: change.to });
    case 'description':
      return activity('issue.descriptionChanged', { from: change.from, to: change.to });
    case 'categoryId': {
      const named = await tx
        .select({ id: issueCategories.id, name: issueCategories.name })
        .from(issueCategories)
        .where(inArray(issueCategories.id, [change.from, change.to]));
      return activity('issue.categoryChanged', {
        from: found(named, change.from, 'INVALID_CATEGORY'),
        to: found(named, change.to, 'INVALID_CATEGORY'),
      });
    }
    case 'priorityId': {
      const named = await tx
        .select({ id: priorities.id, name: priorities.name, level: priorities.level })
        .from(priorities)
        .where(inArray(priorities.id, [change.from, change.to]));
      const from = found(named, change.from, 'INVALID_PRIORITY');
      const to = found(named, change.to, 'INVALID_PRIORITY');
      return activity('issue.priorityChanged', {
        from: { ...from, level: priorityLevelOf(from.level) },
        to: { ...to, level: priorityLevelOf(to.level) },
      });
    }
  }
}

/** The row with `id`, which the request named: one that does not exist is a bad request. */
function found<Row extends { id: string }>(rows: readonly Row[], id: string, code: string): Row {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) {
    throw new HttpError(400, code, 'This value does not exist');
  }
  return row;
}
