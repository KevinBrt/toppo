import { ATTACHMENT_NAME_MAX_LENGTH } from '@toppo-tracker/shared';

/**
 * What a file name never keeps: control characters, and invisible formatting such as the
 * right-to-left override that shows `invoice‮fdp.exe` as `invoiceexe.pdf`.
 */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** The extension of a file name, lowercase, without its dot: `pdf` for `Invoice.PDF`. */
export function extensionOf(name: string): string | null {
  const dot = name.lastIndexOf('.');
  // A leading dot starts a name (`.env`), it does not end one.
  return dot <= 0 || dot === name.length - 1 ? null : name.slice(dot + 1).toLowerCase();
}

/**
 * A file name as Toppo keeps it: its last segment (some browsers send a whole path), without
 * invisible characters, composed (NFC), trimmed, and at most `ATTACHMENT_NAME_MAX_LENGTH`
 * characters, its extension kept. `null` when nothing worth a name is left. The name is only
 * ever shown and offered on download: files lie on disk under a random key.
 */
export function cleanFileName(raw: string): string | null {
  // Composed once the invisible characters are gone: one could sit between a letter and its accent.
  const segment = raw.split(/[/\\]/).at(-1) ?? '';
  const name = segment.replace(INVISIBLE, '').normalize('NFC').trim();
  if (/^\.*$/.test(name)) {
    return null;
  }
  return shortened(name);
}

/** Counted in code points, as PostgreSQL counts `char_length`. */
function shortened(name: string): string {
  const characters = Array.from(name);
  if (characters.length <= ATTACHMENT_NAME_MAX_LENGTH) {
    return name;
  }
  const extension = extensionOf(name);
  const ending = extension === null ? [] : Array.from(`.${extension}`);
  // An extension that long is not one worth keeping.
  if (ending.length > ATTACHMENT_NAME_MAX_LENGTH / 2) {
    return characters.slice(0, ATTACHMENT_NAME_MAX_LENGTH).join('').trimEnd();
  }
  const start = characters.slice(0, ATTACHMENT_NAME_MAX_LENGTH - ending.length).join('');
  return `${start.trimEnd()}${ending.join('')}`;
}
