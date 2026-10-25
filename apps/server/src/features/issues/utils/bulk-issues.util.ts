import { issueVisibilityOf, parseIssueKey } from '@toppo/core';
import { schema } from '@toppo/db';
import type { BulkIssuesResponse, BulkRefusal } from '@toppo/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ProjectContext } from '../../../platform/auth/project-access.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { issues } = schema;

/** An issue an action on several issues takes, as it was before, locked until the action commits. */
export interface BulkIssue {
  id: string;
  /** `WEB-42`, as given. */
  key: string;
  statusId: string;
  closedAt: Date | null;
  categoryId: string;
  priorityId: string;
  assigneeId: string | null;
}

/**
 * The issues of the project that `issueKeys` name and the actor sees, locked in the order of
 * their ids, so that two actions on the same issues wait for each other rather than deadlock; and
 * the keys of the others (gone, out of sight, of another project), which answer as if they did
 * not exist.
 */
export async function issuesToChange(
  tx: Transaction,
  actor: Actor,
  project: ProjectContext,
  issueKeys: readonly string[],
): Promise<{ found: BulkIssue[]; missing: string[] }> {
  const keyOf = new Map<number, string>();
  for (const key of issueKeys) {
    const parts = parseIssueKey(key);
    if (parts?.projectKey === project.key) {
      keyOf.set(parts.number, key);
    }
  }
  const visibility = issueVisibilityOf(project.permissions);
  const rows =
    visibility === 'none' || keyOf.size === 0
      ? []
      : await tx
          .select({
            id: issues.id,
            number: issues.number,
            statusId: issues.statusId,
            closedAt: issues.closedAt,
            categoryId: issues.categoryId,
            priorityId: issues.priorityId,
            assigneeId: issues.assigneeId,
          })
          .from(issues)
          .where(
            and(
              eq(issues.projectId, project.id),
              inArray(issues.number, [...keyOf.keys()]),
              visibility === 'own' ? eq(issues.reporterId, actor.id) : undefined,
            ),
          )
          .orderBy(asc(issues.id))
          .for('update');
  const found = rows.map(({ number, ...row }) => ({ ...row, key: keyOf.get(number) ?? '' }));
  const seen = new Set(found.map(({ key }) => key));
  return { found, missing: issueKeys.filter((key) => !seen.has(key)) };
}

/**
 * What an action on several issues answers, in the order the issues were given: those it
 * changed, and those it refused with why, the missing ones as not found.
 */
export function bulkOutcome(
  issueKeys: readonly string[],
  changed: readonly BulkIssue[],
  refused: readonly { key: string; code: BulkRefusal }[],
  missing: readonly string[],
): BulkIssuesResponse {
  const changedKeys = new Set(changed.map(({ key }) => key));
  const refusals = new Map<string, BulkRefusal>([
    ...missing.map((key) => [key, 'ISSUE_NOT_FOUND'] as const),
    ...refused.map(({ key, code }) => [key, code] as const),
  ]);
  return {
    changed: issueKeys.filter((key) => changedKeys.has(key)),
    refused: issueKeys.flatMap((key) => {
      const code = refusals.get(key);
      return code ? [{ key, code }] : [];
    }),
  };
}
