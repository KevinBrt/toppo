import { extensionOf, isImage, showsInline } from '@toppo-tracker/core';
import {
  ATTACHMENT_MEDIA_TYPES,
  ATTACHMENT_TYPES,
  type AttachmentKind,
  type AttachmentMediaType,
} from '@toppo-tracker/shared';
import type { FileDraft, RefusedFile } from '../models/attachment-draft.model.ts';

const TYPE_BY_EXTENSION: ReadonlyMap<string, AttachmentMediaType> = new Map(
  ATTACHMENT_MEDIA_TYPES.flatMap((mediaType) =>
    ATTACHMENT_TYPES[mediaType].extensions.map((extension) => [extension, mediaType] as const),
  ),
);

/** What the file picker offers: `.png,.jpg,…`. The server still checks every file's content. */
export const ACCEPTED_EXTENSIONS = [...TYPE_BY_EXTENSION.keys()]
  .map((extension) => `.${extension}`)
  .join(',');

/** The type a file's name announces, if Toppo accepts it. */
export function mediaTypeOfName(name: string): AttachmentMediaType | null {
  const extension = extensionOf(name);
  return (extension && TYPE_BY_EXTENSION.get(extension)) || null;
}

/** How a file of this type is shown: images as their thumbnail, other files by their kind's icon. */
export function kindOf(mediaType: AttachmentMediaType): AttachmentKind {
  return ATTACHMENT_TYPES[mediaType].kind;
}

/** How a file is read: shown in the app, opened by the browser in a tab, or downloaded. */
export type FileView = 'app' | 'tab' | 'download';

/**
 * Images and text are shown in the app; a PDF opens in the browser's own viewer; every other
 * file is downloaded, to be opened by the application its extension names.
 */
export function viewOf(mediaType: AttachmentMediaType): FileView {
  if (isImage(mediaType) || kindOf(mediaType) === 'text' || mediaType === 'text/csv') {
    return 'app';
  }
  return showsInline(mediaType) ? 'tab' : 'download';
}

/** The label a file's icon carries: its extension, as people know it (`CSV`, `DOCX`). */
export function typeLabelOf(name: string): string {
  return (extensionOf(name) ?? '').toUpperCase();
}

/**
 * The files chosen, as drafts to send, and those refused at once: of a type the server refuses,
 * empty, too large, or beyond the number a request or a comment takes. The server checks them
 * again, their content too.
 */
export function chooseFiles(
  files: readonly File[],
  { maxFileSize, room }: { maxFileSize: number; room: number },
): { drafts: FileDraft[]; refused: RefusedFile[] } {
  const drafts: FileDraft[] = [];
  const refused: RefusedFile[] = [];
  for (const file of files) {
    const mediaType = mediaTypeOfName(file.name);
    if (mediaType === null) {
      refused.push({ id: crypto.randomUUID(), name: file.name, problem: 'type' });
    } else if (file.size === 0) {
      refused.push({ id: crypto.randomUUID(), name: file.name, problem: 'empty' });
    } else if (file.size > maxFileSize) {
      refused.push({ id: crypto.randomUUID(), name: file.name, problem: 'size' });
    } else if (drafts.length >= room) {
      refused.push({ id: crypto.randomUUID(), name: file.name, problem: 'tooMany' });
    } else {
      drafts.push({ id: crypto.randomUUID(), file, mediaType });
    }
  }
  return { drafts, refused };
}
