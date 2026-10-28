import { type AttachmentPlace, canAttachTo, cleanFileName, mediaTypeOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  ATTACHMENTS_MAX,
  type IssueActivityPayload,
  issueKeyParamsSchema,
} from '@toppo-tracker/shared';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import type { IssueContext } from '../../../platform/auth/project-access.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { receivedFileSchema } from '../../../platform/uploads/file-routes.ts';

const { attachments, comments, issues } = schema;

const TYPE_REFUSALS = {
  typeNotAllowed: ['ATTACHMENT_TYPE_NOT_ALLOWED', 'Files of this type cannot be attached'],
  contentMismatch: [
    'ATTACHMENT_CONTENT_MISMATCH',
    'The content of this file is not of the type its name says',
  ],
} as const;

/**
 * Attaches a received file to an issue's request or, with `commentId`, to one of its comments,
 * for whoever may attach files there. Its name is cleaned; its type is the one its extension
 * names, once its content confirms it. The file is kept under a random key, and its row, the
 * issue's last change and the activity that tells it are written together. Answers its id.
 */
export const addAttachment = defineCommand({
  name: 'attachment.add',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema.extend({
    commentId: z.uuid().optional(),
    fileName: z.string(),
    file: receivedFileSchema,
  }),
  async handler(
    { tx, actor, project, services, log },
    { commentId, fileName, file },
  ): Promise<{ id: string }> {
    const { issue } = project;
    const place =
      commentId === undefined
        ? await lockedRequest(tx, issue)
        : await lockedComment(tx, issue.id, commentId, actor.id);
    if (!canAttachTo(project.permissions, place)) {
      throw new HttpError(403, 'FORBIDDEN', 'You may not attach files here');
    }
    const name = cleanFileName(fileName);
    if (name === null) {
      throw new HttpError(400, 'INVALID_FILE_NAME', 'This file has no name');
    }
    const type = mediaTypeOf(name, file);
    if ('problem' in type) {
      const [code, message] = TYPE_REFUSALS[type.problem];
      throw new HttpError(415, code, message);
    }
    // The request or the comment is locked: two files sent at once cannot pass the limit.
    const [held] = await tx
      .select({ count: count() })
      .from(attachments)
      .where(
        and(
          eq(attachments.issueId, issue.id),
          commentId === undefined
            ? isNull(attachments.commentId)
            : eq(attachments.commentId, commentId),
        ),
      );
    if ((held?.count ?? 0) >= ATTACHMENTS_MAX) {
      throw new HttpError(
        409,
        'TOO_MANY_ATTACHMENTS',
        `At most ${ATTACHMENTS_MAX} files can be attached here`,
      );
    }

    const storageKey = await services.files.keep(file);
    const [attachment] = await tx
      .insert(attachments)
      .values({
        issueId: issue.id,
        commentId: commentId ?? null,
        uploaderId: actor.id,
        fileName: name,
        mediaType: type.mediaType,
        size: file.size,
        storageKey,
      })
      .returning({ id: attachments.id });
    if (!attachment) {
      throw new Error('The attachment was not saved');
    }
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, issue.id));
    const payload: IssueActivityPayload<'issue.attachmentAdded'> = { attachmentId: attachment.id };
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      type: 'issue.attachmentAdded',
      payload,
    });
    log.info(
      { issueId: issue.id, attachmentId: attachment.id, size: file.size, by: actor.id },
      'File attached',
    );
    return { id: attachment.id };
  },
});

/** The issue's request, its row locked until the file is attached. */
async function lockedRequest(tx: Transaction, issue: IssueContext): Promise<AttachmentPlace> {
  await tx.select({ id: issues.id }).from(issues).where(eq(issues.id, issue.id)).for('update');
  return { on: 'request', reportedByThem: issue.reportedByActor };
}

/** A comment of the issue, its row locked until the file is attached. */
async function lockedComment(
  tx: Transaction,
  issueId: string,
  commentId: string,
  actorId: string,
): Promise<AttachmentPlace> {
  const [comment] = await tx
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(and(eq(comments.id, commentId), eq(comments.issueId, issueId)))
    .for('update');
  if (!comment) {
    throw new HttpError(404, 'COMMENT_NOT_FOUND', 'This comment does not exist');
  }
  return { on: 'comment', writtenByThem: comment.authorId === actorId };
}
