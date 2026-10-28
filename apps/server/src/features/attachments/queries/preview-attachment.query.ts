import { showsInline } from '@toppo-tracker/core';
import { attachmentParamsSchema } from '@toppo-tracker/shared';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import type { StoredFile } from '../../../platform/uploads/file-routes.ts';
import { storedFileOf } from '../utils/attachment-rows.util.ts';

/**
 * A file of an issue the caller sees, for the browser to show by itself: an image (its own
 * thumbnail too) or a PDF. Other files are only downloaded.
 */
export const previewAttachment = defineQuery({
  name: 'attachment.preview',
  access: { project: 'issueKey' },
  input: attachmentParamsSchema,
  async handler({ db, project }, { attachmentId }): Promise<StoredFile> {
    const file = await storedFileOf(db, project.issue.id, attachmentId);
    if (!showsInline(file.mediaType)) {
      throw new HttpError(404, 'PREVIEW_NOT_AVAILABLE', 'Only images and PDFs have a preview');
    }
    return file;
  },
});
