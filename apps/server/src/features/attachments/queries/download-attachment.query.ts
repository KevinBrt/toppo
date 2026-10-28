import { attachmentParamsSchema } from '@toppo-tracker/shared';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import type { StoredFile } from '../../../platform/uploads/file-routes.ts';
import { storedFileOf } from '../utils/attachment-rows.util.ts';

/** A file of an issue the caller sees, to download, whatever its type and wherever attached. */
export const downloadAttachment = defineQuery({
  name: 'attachment.download',
  access: { project: 'issueKey' },
  input: attachmentParamsSchema,
  handler: ({ db, project }, { attachmentId }): Promise<StoredFile> =>
    storedFileOf(db, project.issue.id, attachmentId),
});
