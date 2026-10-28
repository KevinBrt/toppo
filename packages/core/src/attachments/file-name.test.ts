import { ATTACHMENT_NAME_MAX_LENGTH } from '@toppo-tracker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cleanFileName, extensionOf } from './file-name.ts';

const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

describe('extensionOf', () => {
  it('reads the last extension, in lowercase', () => {
    expect(extensionOf('Invoice.PDF')).toBe('pdf');
    expect(extensionOf('logs.2026-10-23.log')).toBe('log');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('finds none without a dot, after a final dot, or in a name that starts with one', () => {
    expect(extensionOf('README')).toBeNull();
    expect(extensionOf('notes.')).toBeNull();
    expect(extensionOf('.env')).toBeNull();
  });
});

describe('cleanFileName', () => {
  it('keeps an ordinary name as it is', () => {
    expect(cleanFileName('Export commandes (octobre).csv')).toBe('Export commandes (octobre).csv');
  });

  it('keeps only the last segment of a path', () => {
    expect(cleanFileName('C:\\Users\\ines\\Desktop\\export.csv')).toBe('export.csv');
    expect(cleanFileName('../../etc/passwd')).toBe('passwd');
  });

  it('drops control and invisible characters, such as a right-to-left override', () => {
    expect(cleanFileName('invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
    expect(cleanFileName('a\u0000b\tc\nd.txt')).toBe('abcd.txt');
    expect(cleanFileName('\u200Bnote\u2028.txt')).toBe('note.txt');
  });

  it('composes accents and trims spaces', () => {
    expect(cleanFileName('  re\u0301sume\u0301.pdf  ')).toBe('résumé.pdf');
  });

  it('leaves no name when nothing worth one is left', () => {
    for (const raw of ['', '   ', '.', '..', 'folder/', '\u202E', '\u0000\u0001']) {
      expect(cleanFileName(raw)).toBeNull();
    }
  });

  it('shortens a long name, keeping its extension, counting characters as PostgreSQL does', () => {
    const long = cleanFileName(`${'a'.repeat(300)}.pdf`);
    expect(long).toHaveLength(ATTACHMENT_NAME_MAX_LENGTH);
    expect(long?.endsWith('a.pdf')).toBe(true);

    const emoji = cleanFileName(`${'😀'.repeat(300)}.png`) ?? '';
    expect(Array.from(emoji)).toHaveLength(ATTACHMENT_NAME_MAX_LENGTH);
    expect(emoji.endsWith('😀.png')).toBe(true);

    expect(Array.from(cleanFileName(`a.${'x'.repeat(300)}`) ?? '')).toHaveLength(
      ATTACHMENT_NAME_MAX_LENGTH,
    );
  });

  it('gives a name that is safe to show and to store, and stays as it is when cleaned again', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 400 }), (raw) => {
        const name = cleanFileName(raw);
        if (name === null) {
          return;
        }
        expect(name).not.toMatch(/[/\\]/);
        expect(name).not.toMatch(INVISIBLE);
        expect(name).toBe(name.trim());
        expect(name).toBe(name.normalize('NFC'));
        expect(Array.from(name).length).toBeLessThanOrEqual(ATTACHMENT_NAME_MAX_LENGTH);
        expect(cleanFileName(name)).toBe(name);
      }),
    );
  });

  it('keeps the extension of any name it shortens', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(...'abcdefgh -_'), minLength: 1, maxLength: 600 }),
        fc.constantFrom('pdf', 'docx', 'png', 'log'),
        (base, extension) => {
          const name = cleanFileName(`x${base}.${extension}`);
          expect(name === null ? null : extensionOf(name)).toBe(extension);
        },
      ),
    );
  });
});
