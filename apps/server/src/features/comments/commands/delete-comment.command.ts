import { commentActionsOf } from '@toppo/core';
import { schema } from '@toppo/db';
import { commentParamsSchema, type IssueActivityPayload } from '@toppo/shared';
import { eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { lockedComment } from './edit-comment.command.ts';

const { comments, issues } = schema;

/**
 * Deletes a comment for good, by its author or a moderator (`commentActionsOf`, which needs no
 * single permission). The activity keeps its id only: its words leave no trace.
 */
export const deleteComment = defineCommand({
  name: 'comment.delete',
  access: { project: 'issueKey' },
  input: commentParamsSchema,
  async handler({ tx, actor, project, log }, { commentId }): Promise<void> {
    const comment = await lockedComment(tx, project.issue.id, commentId);
    const allowed = commentActionsOf(project.permissions, comment.authorId === actor.id);
    if (!allowed.includes('delete')) {
      throw new HttpError(403, 'FORBIDDEN', 'You may not delete this comment');
    }
    await tx.delete(comments).where(eq(comments.id, commentId));
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, project.issue.id));
    const payload: IssueActivityPayload<'issue.commentDeleted'> = { commentId };
    await recordActivity(tx, {
      projectId: project.id,
      issueId: project.issue.id,
      actorId: actor.id,
      type: 'issue.commentDeleted',
      payload,
    });
    log.info({ issueId: project.issue.id, commentId, by: actor.id }, 'Comment deleted');
  },
});
