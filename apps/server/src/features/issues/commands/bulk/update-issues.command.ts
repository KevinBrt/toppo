import { type IssueChange, priorityLevelOf } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  type BulkIssuesResponse,
  bulkFieldsRequestSchema,
  projectIssuesParamsSchema,
} from '@toppo/shared';
import { inArray } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { activity } from '../../utils/activities.util.ts';
import { type BulkIssue, bulkOutcome, issuesToChange } from '../../utils/bulk-issues.util.ts';

const { issueCategories, issues, priorities } = schema;

/**
 * Gives several issues of a project a category, a priority or both, each change recorded and
 * told as if made on its issue alone. An issue already as asked is left as it is.
 */
export const bulkUpdateIssues = defineCommand({
  name: 'issue.bulkUpdate',
  access: { project: 'projectKey', permission: 'issue.update' },
  input: projectIssuesParamsSchema.extend(bulkFieldsRequestSchema.shape),
  async handler(
    { tx, actor, project, log },
    { issueKeys, categoryId, priorityId },
  ): Promise<BulkIssuesResponse> {
    const { found, missing } = await issuesToChange(tx, actor, project, issueKeys);
    const requested = { categoryId, priorityId };
    const changesOf = new Map(found.map((issue) => [issue, changesTo(issue, requested)] as const));
    const changed = found.filter((issue) => (changesOf.get(issue) ?? []).length > 0);
    const names = await namesOf(tx, requested, [...changesOf.values()].flat());
    if (changed.length === 0) {
      return bulkOutcome(issueKeys, [], [], missing);
    }

    await tx
      .update(issues)
      .set({ ...(categoryId ? { categoryId } : {}), ...(priorityId ? { priorityId } : {}) })
      .where(
        inArray(
          issues.id,
          changed.map(({ id }) => id),
        ),
      );
    await recordActivities(
      tx,
      changed.flatMap((issue) =>
        (changesOf.get(issue) ?? []).map((change) => ({
          projectId: project.id,
          issueId: issue.id,
          actorId: actor.id,
          ...names.activityOf(change),
        })),
      ),
    );
    log.info(
      { projectId: project.id, categoryId, priorityId, changed: changed.length, by: actor.id },
      'Issues updated',
    );
    return bulkOutcome(issueKeys, changed, [], missing);
  },
});

type BulkField = 'categoryId' | 'priorityId';

type Requested = Partial<Record<BulkField, string | undefined>>;

/** The fields the request really changes on an issue: one activity each. */
function changesTo(issue: BulkIssue, requested: Requested): IssueChange[] {
  return (['categoryId', 'priorityId'] as const satisfies BulkField[]).flatMap((field) => {
    const to = requested[field];
    return to !== undefined && to !== issue[field] ? [{ field, from: issue[field], to }] : [];
  });
}

/**
 * The categories and priorities asked for and those the issues leave, by their names now, read
 * once for every issue: one asked for that does not exist is a bad request.
 */
async function namesOf(tx: Transaction, requested: Requested, changes: readonly IssueChange[]) {
  const idsOf = (field: BulkField) => [
    ...new Set([
      ...(requested[field] ? [requested[field]] : []),
      ...changes.filter((change) => change.field === field).map(({ from }) => from),
    ]),
  ];
  const categoryIds = idsOf('categoryId');
  const priorityIds = idsOf('priorityId');
  const [categories, levels] = await Promise.all([
    categoryIds.length === 0
      ? []
      : tx
          .select({ id: issueCategories.id, name: issueCategories.name })
          .from(issueCategories)
          .where(inArray(issueCategories.id, categoryIds)),
    priorityIds.length === 0
      ? []
      : tx
          .select({ id: priorities.id, name: priorities.name, level: priorities.level })
          .from(priorities)
          .where(inArray(priorities.id, priorityIds)),
  ]);
  const category = (id: string) => found(categories, id, 'INVALID_CATEGORY');
  const priority = (id: string) => {
    const row = found(levels, id, 'INVALID_PRIORITY');
    return { ...row, level: priorityLevelOf(row.level) };
  };
  if (requested.categoryId) {
    category(requested.categoryId);
  }
  if (requested.priorityId) {
    priority(requested.priorityId);
  }
  return {
    activityOf(change: IssueChange) {
      switch (change.field) {
        case 'categoryId':
          return activity('issue.categoryChanged', {
            from: category(change.from),
            to: category(change.to),
          });
        case 'priorityId':
          return activity('issue.priorityChanged', {
            from: priority(change.from),
            to: priority(change.to),
          });
        default:
          throw new Error(`Not a change made on several issues: ${change.field}`);
      }
    },
  };
}

/** The row with `id`, which the request named: one that does not exist is a bad request. */
function found<Row extends { id: string }>(rows: readonly Row[], id: string, code: string): Row {
  const row = rows.find((candidate) => candidate.id === id);
  if (!row) {
    throw new HttpError(400, code, 'This value does not exist');
  }
  return row;
}
