import {
  ATTACHMENT_MEDIA_TYPES,
  ATTACHMENT_TYPES,
  type AttachmentMediaType,
} from '@toppo-tracker/shared';
import { extensionOf } from './file-name.ts';

/** How many of a file's first bytes `mediaTypeOf` needs: enough for every signature it checks. */
export const FILE_HEAD_LENGTH = 128;

/** What is known of a file's content: its first bytes, and whether it is all text (`createTextScan`). */
export interface FileContent {
  head: Uint8Array;
  text: boolean;
}

/** Why a file is refused: its extension names no type Toppo accepts, or its content is not of that type. */
export type FileTypeProblem = 'typeNotAllowed' | 'contentMismatch';

export type FileTypeCheck = { mediaType: AttachmentMediaType } | { problem: FileTypeProblem };

const MEDIA_TYPE_BY_EXTENSION: ReadonlyMap<string, AttachmentMediaType> = new Map(
  ATTACHMENT_MEDIA_TYPES.flatMap((mediaType) =>
    ATTACHMENT_TYPES[mediaType].extensions.map((extension) => [extension, mediaType] as const),
  ),
);

const bytesOf = (text: string): number[] =>
  Array.from(text, (character) => character.charCodeAt(0));

function has(head: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  return bytes.every((byte, index) => head[offset + index] === byte);
}

const PNG = [0x89, ...bytesOf('PNG\r\n\x1a\n')];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP = bytesOf('PK\x03\x04');
/** The name of the entry an OpenDocument file must start with. */
const ODF_TYPE_ENTRY = 'mimetype';
/** Where a ZIP's first entry starts: its name, after a local header of 30 bytes. */
const ZIP_FIRST_NAME_OFFSET = 30;

/**
 * Whether a file is the OpenDocument of `mediaType`: a ZIP whose first entry, named `mimetype`,
 * is stored as is (no compression, no extra field) and holds exactly that type, as the standard
 * requires.
 */
function isOpenDocument(head: Uint8Array, mediaType: string): boolean {
  const content = ZIP_FIRST_NAME_OFFSET + ODF_TYPE_ENTRY.length;
  return (
    has(head, ZIP) &&
    has(head, [0, 0], 8) &&
    has(head, [mediaType.length, 0, 0, 0], 22) &&
    has(head, [ODF_TYPE_ENTRY.length, 0, 0, 0], 26) &&
    has(head, bytesOf(ODF_TYPE_ENTRY), ZIP_FIRST_NAME_OFFSET) &&
    has(head, bytesOf(mediaType), content)
  );
}

/** A ZIP that is not an OpenDocument: the container of Office Open XML files. */
function isOfficeOpenXml(head: Uint8Array): boolean {
  return has(head, ZIP) && !has(head, bytesOf(ODF_TYPE_ENTRY), ZIP_FIRST_NAME_OFFSET);
}

/**
 * What the content of each type starts with. Office files are recognised by their container
 * (OLE2 for the older ones, ZIP for the others): Toppo never opens them, and whoever downloads one
 * opens it with the application its extension names.
 */
const MATCHES: Record<AttachmentMediaType, (content: FileContent) => boolean> = {
  'image/png': ({ head }) => has(head, PNG) && has(head, bytesOf('IHDR'), 12),
  'image/jpeg': ({ head }) => has(head, [0xff, 0xd8, 0xff]),
  'image/webp': ({ head }) => has(head, bytesOf('RIFF')) && has(head, bytesOf('WEBPVP8'), 8),
  'application/pdf': ({ head }) => has(head, bytesOf('%PDF-')),
  'text/plain': ({ text }) => text,
  'text/csv': ({ text }) => text,
  'application/msword': ({ head }) => has(head, OLE),
  'application/vnd.ms-excel': ({ head }) => has(head, OLE),
  'application/vnd.ms-powerpoint': ({ head }) => has(head, OLE),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ({ head }) =>
    isOfficeOpenXml(head),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ({ head }) =>
    isOfficeOpenXml(head),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ({ head }) =>
    isOfficeOpenXml(head),
  'application/vnd.oasis.opendocument.text': ({ head }) =>
    isOpenDocument(head, 'application/vnd.oasis.opendocument.text'),
  'application/vnd.oasis.opendocument.spreadsheet': ({ head }) =>
    isOpenDocument(head, 'application/vnd.oasis.opendocument.spreadsheet'),
  'application/vnd.oasis.opendocument.presentation': ({ head }) =>
    isOpenDocument(head, 'application/vnd.oasis.opendocument.presentation'),
};

/**
 * The type of a file, as its name announces it and its content confirms it. The extension
 * chooses the type, since it is what the file will be opened by; the content must then be of
 * that type, whatever the client said it was.
 */
export function mediaTypeOf(fileName: string, content: FileContent): FileTypeCheck {
  const extension = extensionOf(fileName);
  const mediaType = extension === null ? undefined : MEDIA_TYPE_BY_EXTENSION.get(extension);
  if (mediaType === undefined) {
    return { problem: 'typeNotAllowed' };
  }
  return MATCHES[mediaType](content) ? { mediaType } : { problem: 'contentMismatch' };
}

/** Whether a file of this type is shown as itself, as a thumbnail, rather than by an icon. */
export function isImage(mediaType: AttachmentMediaType): boolean {
  return ATTACHMENT_TYPES[mediaType].kind === 'image';
}

/**
 * Whether browsers show a file of this type by themselves, running nothing of it in the page:
 * images, and PDFs in the browser's own viewer, which keeps a PDF's scripts to itself. Every
 * other file is only ever downloaded.
 */
export function showsInline(mediaType: AttachmentMediaType): boolean {
  return isImage(mediaType) || mediaType === 'application/pdf';
}
