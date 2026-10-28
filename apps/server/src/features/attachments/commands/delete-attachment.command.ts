import { attachmentActionsOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { attachmentParamsSchema, type IssueActivityPayload } from '@toppo-tracker/shared';
import { and, eq, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { attachmentNotFound, placeOf } from '../utils/attachment-rows.util.ts';

const { attachments, comments, issues } = schema;

/**
 * Removes a file for good (`attachmentActionsOf`, which needs no single permission): its row
 * goes, and the file leaves the disk at the next sweep, unreachable from now on. The activity
 * keeps its id only: its name leaves no trace.
 */
export const deleteAttachment = defineCommand({
  name: 'attachment.delete',
  access: { project: 'issueKey' },
  input: attachmentParamsSchema,
  async handler({ tx, actor, project, log }, { attachmentId }): Promise<void> {
    const { issue } = project;
    const [file] = await tx
      .select({ uploaderId: attachments.uploaderId, commentAuthorId: comments.authorId })
      .from(attachments)
      .leftJoin(comments, eq(comments.id, attachments.commentId))
      .where(and(eq(attachments.id, attachmentId), eq(attachments.issueId, issue.id)))
      .for('update', { of: attachments });
    if (!file) {
      throw attachmentNotFound();
    }
    const place = placeOf(file, issue, actor.id);
    const allowed = attachmentActionsOf(project.permissions, place, file.uploaderId === actor.id);
    if (!allowed.includes('delete')) {
      throw new HttpError(403, 'FORBIDDEN', 'You may not remove this file');
    }
    await tx.delete(attachments).where(eq(attachments.id, attachmentId));
    await tx.update(issues).set({ updatedAt: sql`now()` }).where(eq(issues.id, issue.id));
    const payload: IssueActivityPayload<'issue.attachmentRemoved'> = { attachmentId };
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      type: 'issue.attachmentRemoved',
      payload,
    });
    log.info({ issueId: issue.id, attachmentId, by: actor.id }, 'File removed');
  },
});
