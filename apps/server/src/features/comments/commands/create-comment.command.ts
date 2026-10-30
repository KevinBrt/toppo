import { schema } from '@toppo-tracker/db';
import {
  commentRequestSchema,
  type IssueActivityPayload,
  issueKeyParamsSchema,
} from '@toppo-tracker/shared';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { type CommandScope, defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { writeOnce } from '../../../platform/plugins/once.ts';
import { namedPeople } from '../utils/mentions.util.ts';

const { comments, issues } = schema;

const ACCESS = { project: 'issueKey', permission: 'comment.create' } as const;

const createdSchema = z.object({ id: z.uuid() });

/**
 * Comments on an issue the caller sees, in plain text: the comment, the issue's last change and
 * the activity that tells it, together, with the people it names (`namedPeople`) to tell them.
 * Answers the comment's id. A plugin may give a key (`once`) that makes its comment single: an
 * event it handles twice comments once.
 */
export const createComment = defineCommand({
  name: 'comment.create',
  access: ACCESS,
  input: issueKeyParamsSchema.extend(commentRequestSchema.shape).extend({
    once: z.string().min(1).max(200).optional(),
  }),
  async handler(scope, { once, body, mentions }): Promise<{ id: string }> {
    const { tx, actor } = scope;
    const write = () => addComment(scope, body, mentions);
    return actor.plugin && once
      ? await writeOnce(
          tx,
          { pluginSlug: actor.plugin.slug, method: 'issues.comment', key: once },
          createdSchema,
          write,
        )
      : await write();
  },
});

async function addComment(
  { tx, actor, project, log }: CommandScope<typeof ACCESS>,
  body: string,
  mentions: readonly string[],
): Promise<{ id: string }> {
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
}
