import { followersOf } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import { and, eq, isNull } from 'drizzle-orm';
import { reachableBy } from '../../../platform/auth/project-access.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { comments, issueFollowers, projects, users } = schema;

/**
 * Whether someone is an active member who reaches the project: who may be given its issues, or
 * named by a person property of them.
 */
export async function reachesProject(
  tx: Transaction,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const [reaching] = await tx
    .select({ id: projects.id })
    .from(projects)
    .innerJoin(users, eq(users.id, userId))
    .where(
      and(
        eq(projects.id, projectId),
        isNull(users.deletedAt),
        isNull(users.deactivatedAt),
        reachableBy(userId),
      ),
    );
  return reaching !== undefined;
}

/**
 * Whether `userId` follows an issue (`followersOf`): its reporter, assignee or a commenter unless
 * they stopped, or by choice.
 */
export async function followsIssue(
  db: Pick<Db, 'select'>,
  issue: { id: string; reporterId: string; assigneeId: string | null },
  userId: string,
): Promise<boolean> {
  const [commented] = await db
    .select({ id: comments.id })
    .from(comments)
    .where(and(eq(comments.issueId, issue.id), eq(comments.authorId, userId)))
    .limit(1);
  const [choice] = await db
    .select({ following: issueFollowers.following })
    .from(issueFollowers)
    .where(and(eq(issueFollowers.issueId, issue.id), eq(issueFollowers.userId, userId)));
  return followersOf({
    reporterId: issue.reporterId,
    assigneeId: issue.assigneeId,
    commenterIds: commented ? [userId] : [],
    followerIds: choice?.following === true ? [userId] : [],
    unfollowerIds: choice?.following === false ? [userId] : [],
  }).includes(userId);
}
