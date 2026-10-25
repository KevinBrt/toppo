import { followersOf } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import { and, eq, isNull } from 'drizzle-orm';
import { reachableBy, whoSeesIssue } from '../../../platform/auth/project-access.ts';
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
 * Those who follow an issue and would be told of it now (`followersOf`): its reporter, assignee
 * and commenters unless they stopped, and those who chose to, if they still see it.
 */
export async function followersOfIssue(
  db: Pick<Db, 'select' | 'selectDistinct'>,
  issue: { id: string; reporterId: string; assigneeId: string | null },
): Promise<string[]> {
  const commenters = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.issueId, issue.id));
  const choices = await db
    .select({ userId: issueFollowers.userId, following: issueFollowers.following })
    .from(issueFollowers)
    .where(eq(issueFollowers.issueId, issue.id));
  const followers = followersOf({
    reporterId: issue.reporterId,
    assigneeId: issue.assigneeId,
    commenterIds: commenters.map(({ authorId }) => authorId),
    followerIds: choices.filter(({ following }) => following).map(({ userId }) => userId),
    unfollowerIds: choices.filter(({ following }) => !following).map(({ userId }) => userId),
  });
  return whoSeesIssue(db, issue.id, followers);
}
