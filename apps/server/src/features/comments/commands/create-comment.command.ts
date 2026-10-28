import { schema } from '@toppo-tracker/db';
import {
  commentRequestSchema,
  type IssueActivityPayload,
  issueKeyParamsSchema,
} from '@toppo-tracker/shared';
import { eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { namedPeople } from '../utils/mentions.util.ts';

const { comments, issues } = schema;

/**
 * Comments on an issue the caller sees, in plain text: the comment, the issue's last change and
 * the activity that tells it, together, with the people it names (`namedPeople`) to tell them.
 * Answers the comment's id.
 */
export const createComment = defineCommand({
  name: 'comment.create',
  access: { project: 'issueKey', permission: 'comment.create' },
  input: issueKeyParamsSchema.extend(commentRequestSchema.shape),
  async handler({ tx, actor, project, log }, { body, mentions }): Promise<{ id: string }> {
    const mentioned = await namedPeople(tx, project, actor.id, mentions);
    const [comment] = await tx
      .insert(comments)
      .values({ issueId: project.issue.id, authorId: actor.id, body })
      .returning({ id: comments.id });
    if (!comment) {
      throw new Error('The comment was not saved');
    }
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, project.issue.id));
    const payload: IssueActivityPayload<'issue.commented'> = { commentId: comment.id, mentioned };
    await recordActivity(tx, {
      projectId: project.id,
      issueId: project.issue.id,
      actorId: actor.id,
      type: 'issue.commented',
      payload,
    });
    log.info({ issueId: project.issue.id, commentId: comment.id, by: actor.id }, 'Comment added');
    return { id: comment.id };
  },
});
