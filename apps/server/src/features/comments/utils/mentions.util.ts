import { issueVisibilityOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { and, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { type IssueProjectContext, seeingIssue } from '../../../platform/auth/project-access.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { activities, comments, issues, users } = schema;

/**
 * The people a comment on the issue of `project` may name, as a condition on `users`: those who
 * see the issue. Someone who sees only their own issues does not learn who else works on the
 * project: they may name those already on the issue only, its reporter, assignee and commenters.
 */
export function mentionableIn(project: IssueProjectContext): SQL {
  const seeing = seeingIssue(project.issue.id);
  if (issueVisibilityOf(project.permissions) === 'all') {
    return seeing;
  }
  const issueId = project.issue.id;
  return sql`(${seeing} and ${users.id} in (
    select ${issues.reporterId} from ${issues} where ${issues.id} = ${issueId}
    union select ${issues.assigneeId} from ${issues} where ${issues.id} = ${issueId}
    union select ${comments.authorId} from ${comments} where ${comments.issueId} = ${issueId}
  ))`;
}

/**
 * The people a comment names, each once and never its author, once checked: naming someone
 * who may not be named (`mentionableIn`) refuses the comment.
 */
export async function namedPeople(
  tx: Transaction,
  project: IssueProjectContext,
  authorId: string,
  mentions: readonly string[],
): Promise<string[]> {
  const named = [...new Set(mentions)].filter((id) => id !== authorId);
  if (named.length === 0) {
    return [];
  }
  const found = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, named), mentionableIn(project)));
  if (found.length !== named.length) {
    throw new HttpError(400, 'INVALID_MENTION', 'Someone named here cannot be mentioned');
  }
  return named;
}

/** The people a comment has named so far: an edit tells only those it names for the first time. */
export async function namedBefore(
  tx: Transaction,
  issueId: string,
  commentId: string,
): Promise<Set<string>> {
  const rows = await tx
    .select({
      userId: sql<string>`jsonb_array_elements_text(${activities.payload} -> 'mentioned')`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.issueId, issueId),
        inArray(activities.type, ['issue.commented', 'issue.commentEdited']),
        sql`${activities.payload} ->> 'commentId' = ${commentId}`,
      ),
    );
  return new Set(rows.map(({ userId }) => userId));
}
