import type { AttachmentMediaType } from '@toppo-tracker/shared';

/** A file chosen to attach, not sent yet. */
export interface FileDraft {
  /** Tells drafts apart in lists: two files may share a name. */
  id: string;
  file: File;
  /** What its name announces; the server confirms it from the content. */
  mediaType: AttachmentMediaType;
}

/** Why a chosen file is refused before being sent. */
export type FileProblem = 'type' | 'empty' | 'size' | 'tooMany';

export interface RefusedFile {
  id: string;
  name: string;
  problem: FileProblem;
}
