import { commentActionsOf } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  commentParamsSchema,
  commentRequestSchema,
  type IssueActivityPayload,
} from '@toppo/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { namedBefore, namedPeople } from '../utils/mentions.util.ts';

const { comments, issues } = schema;

/**
 * Changes the words of a comment, its author only (`commentActionsOf`): marked as edited, the
 * issue's last change and an activity with it, which tells those it names for the first time.
 * The same words change nothing.
 */
export const editComment = defineCommand({
  name: 'comment.edit',
  access: { project: 'issueKey', permission: 'comment.create' },
  input: commentParamsSchema.extend(commentRequestSchema.shape),
  async handler({ tx, actor, project, log }, { commentId, body, mentions }): Promise<void> {
    const comment = await lockedComment(tx, project.issue.id, commentId);
    const allowed = commentActionsOf(project.permissions, comment.authorId === actor.id);
    if (!allowed.includes('edit')) {
      throw new HttpError(403, 'FORBIDDEN', 'Only its author may change a comment');
    }
    if (comment.body === body) {
      return;
    }
    const before = await namedBefore(tx, project.issue.id, commentId);
    const mentioned = await namedPeople(
      tx,
      project,
      actor.id,
      mentions.filter((id) => !before.has(id)),
    );
    await tx.update(comments).set({ body, editedAt: sql`now()` }).where(eq(comments.id, commentId));
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, project.issue.id));
    const payload: IssueActivityPayload<'issue.commentEdited'> = { commentId, mentioned };
    await recordActivity(tx, {
      projectId: project.id,
      issueId: project.issue.id,
      actorId: actor.id,
      type: 'issue.commentEdited',
      payload,
    });
    log.info({ issueId: project.issue.id, commentId, by: actor.id }, 'Comment edited');
  },
});

/**
 * A comment of the issue, locked until the change commits: two changes at once apply one after
 * the other. One of another issue answers like one that does not exist.
 */
export async function lockedComment(
  tx: Transaction,
  issueId: string,
  commentId: string,
): Promise<{ authorId: string; body: string }> {
  const [comment] = await tx
    .select({ authorId: comments.authorId, body: comments.body })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.issueId, issueId)))
    .for('update');
  if (!comment) {
    throw new HttpError(404, 'COMMENT_NOT_FOUND', 'This comment does not exist');
  }
  return comment;
}
