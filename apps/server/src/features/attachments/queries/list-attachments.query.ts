import { attachmentActionsOf } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  ATTACHMENTS_MAX,
  type IssueAttachmentsResponse,
  issueKeyParamsSchema,
} from '@toppo-tracker/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { toIssueAttachment } from '../utils/attachment-rows.util.ts';

const { attachments } = schema;

/**
 * The files of an issue's request, oldest first, with what the caller may do on each; those of
 * its comments come with the comments, in its history.
 */
export const listAttachments = defineQuery({
  name: 'attachment.list',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema,
  async handler({ db, actor, project }): Promise<IssueAttachmentsResponse> {
    const rows = await db
      .select({
        id: attachments.id,
        fileName: attachments.fileName,
        mediaType: attachments.mediaType,
        size: attachments.size,
        uploaderId: attachments.uploaderId,
      })
      .from(attachments)
      .where(and(eq(attachments.issueId, project.issue.id), isNull(attachments.commentId)))
      .orderBy(asc(attachments.createdAt), asc(attachments.id))
      .limit(ATTACHMENTS_MAX);
    const place = { on: 'request', reportedByThem: project.issue.reportedByActor } as const;
    return {
      rows: rows.map((row) =>
        toIssueAttachment(
          row,
          // Read-only while archived: nothing to offer.
          project.archived
            ? []
            : attachmentActionsOf(project.permissions, place, row.uploaderId === actor.id),
        ),
      ),
    };
  },
});
