import type { AttachmentPlace } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import type { AttachmentAction, AttachmentMediaType, IssueAttachment } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import type { IssueContext } from '../../../platform/auth/project-access.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import type { StoredFile } from '../../../platform/uploads/file-routes.ts';

const { attachments } = schema;

export const attachmentNotFound = () =>
  new HttpError(404, 'ATTACHMENT_NOT_FOUND', 'This file does not exist');

/** Where a file is, as the rights to it read it: the issue's request, or a comment and its author. */
export function placeOf(
  file: { commentAuthorId: string | null },
  issue: IssueContext,
  actorId: string,
): AttachmentPlace {
  return file.commentAuthorId === null
    ? { on: 'request', reportedByThem: issue.reportedByActor }
    : { on: 'comment', writtenByThem: file.commentAuthorId === actorId };
}

/** A file as the API shows it: never where it lies on disk. */
export function toIssueAttachment(
  row: { id: string; fileName: string; mediaType: AttachmentMediaType; size: number },
  actions: AttachmentAction[],
): IssueAttachment {
  return {
    id: row.id,
    fileName: row.fileName,
    mediaType: row.mediaType,
    size: row.size,
    actions,
  };
}

/** A file of an issue, to send; one of another issue does not exist. */
export async function storedFileOf(
  db: Db,
  issueId: string,
  attachmentId: string,
): Promise<StoredFile> {
  const [file] = await db
    .select({
      storageKey: attachments.storageKey,
      fileName: attachments.fileName,
      mediaType: attachments.mediaType,
      size: attachments.size,
    })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.issueId, issueId)));
  if (!file) {
    throw attachmentNotFound();
  }
  return file;
}
