import { ATTACHMENT_MEDIA_TYPES, type AttachmentMediaType } from '@toppo-tracker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  FILE_HEAD_LENGTH,
  type FileContent,
  isImage,
  mediaTypeOf,
  showsInline,
} from './file-type.ts';

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

/** The first bytes of a file, padded to the head `mediaTypeOf` reads. */
function head(...parts: (number | string)[]): Uint8Array {
  const bytes = parts.flatMap((part) => (typeof part === 'string' ? ascii(part) : [part]));
  return Uint8Array.from({ length: FILE_HEAD_LENGTH }, (_, index) => bytes[index] ?? 0x20);
}

/**
 * The local header of a ZIP's first entry, named `name`, stored as is and `size` bytes long:
 * version, then flags, method, time, date, checksum and compressed size, all zero here.
 */
function zipEntry(name: string, size: number): (number | string)[] {
  const zeros = Array<number>(16).fill(0);
  return ['PK\x03\x04', 20, 0, ...zeros, size, 0, 0, 0, name.length, 0, 0, 0, name];
}

const openDocument = (mediaType: string) =>
  head(...zipEntry('mimetype', mediaType.length), mediaType, 'PK\x03\x04');

const binary = (bytes: Uint8Array): FileContent => ({ head: bytes, text: false });

const FILES: Record<string, FileContent> = {
  png: binary(head(0x89, 'PNG\r\n\x1a\n', 0, 0, 0, 13, 'IHDR')),
  jpeg: binary(head(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF')),
  webp: binary(head('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ')),
  pdf: binary(head('%PDF-1.7\n')),
  ole: binary(head(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)),
  officeOpenXml: binary(head(...zipEntry('[Content_Types].xml', 120))),
  odt: binary(openDocument('application/vnd.oasis.opendocument.text')),
  ods: binary(openDocument('application/vnd.oasis.opendocument.spreadsheet')),
  odp: binary(openDocument('application/vnd.oasis.opendocument.presentation')),
  text: { head: head('Numéro;Montant\n'), text: true },
  html: { head: head('<!doctype html><script>alert(1)</script>'), text: true },
};

describe('mediaTypeOf', () => {
  it.each<[string, FileContent | undefined, AttachmentMediaType]>([
    ['capture.png', FILES['png'], 'image/png'],
    ['photo.jpg', FILES['jpeg'], 'image/jpeg'],
    ['PHOTO.JPEG', FILES['jpeg'], 'image/jpeg'],
    ['capture.webp', FILES['webp'], 'image/webp'],
    ['facture.pdf', FILES['pdf'], 'application/pdf'],
    ['notes.txt', FILES['text'], 'text/plain'],
    ['server.log', FILES['text'], 'text/plain'],
    ['export.csv', FILES['text'], 'text/csv'],
    ['lettre.doc', FILES['ole'], 'application/msword'],
    ['budget.xls', FILES['ole'], 'application/vnd.ms-excel'],
    ['slides.ppt', FILES['ole'], 'application/vnd.ms-powerpoint'],
    [
      'lettre.docx',
      FILES['officeOpenXml'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    [
      'budget.xlsx',
      FILES['officeOpenXml'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    [
      'slides.pptx',
      FILES['officeOpenXml'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    ['lettre.odt', FILES['odt'], 'application/vnd.oasis.opendocument.text'],
    ['budget.ods', FILES['ods'], 'application/vnd.oasis.opendocument.spreadsheet'],
    ['slides.odp', FILES['odp'], 'application/vnd.oasis.opendocument.presentation'],
  ])('reads %s as %s', (name, content, mediaType) => {
    expect(content && mediaTypeOf(name, content)).toStrictEqual({ mediaType });
  });

  it('accepts every type of @toppo-tracker/shared, by one extension at least', () => {
    const accepted = Object.values(FILES).flatMap((content) =>
      ['png', 'jpg', 'webp', 'pdf', 'txt', 'csv', 'doc', 'xls', 'ppt']
        .concat(['docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp'])
        .map((extension) => mediaTypeOf(`file.${extension}`, content))
        .flatMap((check) => ('mediaType' in check ? [check.mediaType] : [])),
    );
    expect(new Set(accepted)).toStrictEqual(new Set(ATTACHMENT_MEDIA_TYPES));
  });

  it('refuses the types it does not know, whatever the content', () => {
    for (const name of ['logo.svg', 'page.html', 'setup.exe', 'export.zip', 'anim.gif']) {
      expect(mediaTypeOf(name, FILES['text'] ?? binary(head()))).toStrictEqual({
        problem: 'typeNotAllowed',
      });
    }
    expect(mediaTypeOf('README', FILES['text'] ?? binary(head()))).toStrictEqual({
      problem: 'typeNotAllowed',
    });
    expect(mediaTypeOf('.png', FILES['png'] ?? binary(head()))).toStrictEqual({
      problem: 'typeNotAllowed',
    });
  });

  it.each<[string, FileContent | undefined]>([
    ['page.png', FILES['html']],
    ['capture.pdf', FILES['png']],
    ['facture.jpg', FILES['pdf']],
    ['virus.doc', binary(head('MZ', 0x90, 0))],
    ['export.docx', FILES['ole']],
    ['lettre.docx', FILES['odt']],
    ['lettre.ods', FILES['odt']],
    ['modele.odt', binary(openDocument('application/vnd.oasis.opendocument.text-template'))],
    ['capture.csv', FILES['png']],
  ])('refuses %s, whose content is of another type', (name, content) => {
    expect(content && mediaTypeOf(name, content)).toStrictEqual({ problem: 'contentMismatch' });
  });

  it('never takes random bytes for an image', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: FILE_HEAD_LENGTH, maxLength: FILE_HEAD_LENGTH }),
        (bytes) => {
          fc.pre(bytes[0] !== 0x89 && bytes[0] !== 0xff && bytes[0] !== 0x52);
          for (const name of ['a.png', 'a.jpg', 'a.webp']) {
            expect(mediaTypeOf(name, binary(bytes))).toStrictEqual({ problem: 'contentMismatch' });
          }
        },
      ),
    );
  });
});

describe('showsInline', () => {
  it('lets browsers show images and PDFs, nothing else', () => {
    expect(ATTACHMENT_MEDIA_TYPES.filter(showsInline)).toStrictEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ]);
  });
});

describe('isImage', () => {
  it('shows images as themselves, every other file by an icon', () => {
    expect(ATTACHMENT_MEDIA_TYPES.filter(isImage)).toStrictEqual([
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
  });
});
