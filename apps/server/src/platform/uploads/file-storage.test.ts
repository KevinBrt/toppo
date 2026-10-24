import { readdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { createTestFileStorage } from '../../test-helpers.ts';
import { HttpError } from '../http/http-error.ts';
import { ReceivedFile } from './file-storage.ts';

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A request body arriving in `chunks`. */
const bodyOf = (...chunks: (string | Buffer)[]) =>
  Readable.from(chunks.map((chunk) => Buffer.from(chunk)));

async function refusal(run: () => Promise<unknown>): Promise<{ status: number; code: string }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof HttpError) {
      return { status: error.statusCode, code: error.code };
    }
    throw error;
  }
  throw new Error('Expected a refusal');
}

const anHourAgo = () => new Date(Date.now() - 61 * 60 * 1000);

describe('receiving a file', () => {
  it('writes the body to disk, with what tells its type', async () => {
    const files = await createTestFileStorage();
    const received = await files.receive(bodyOf(PNG_HEAD, 'rest of the image'), '25');

    expect(received.size).toBe(25);
    expect(Buffer.from(received.head).subarray(0, 8)).toStrictEqual(PNG_HEAD);
    expect(received.text).toBe(true);
    expect(readFileSync(received.path, 'utf8')).toContain('rest of the image');
    expect((await files.receive(bodyOf('a', '\0', 'b'), '3')).text).toBe(false);
  });

  // Windows has no such modes: Node reports every file as readable by all.
  it.runIf(process.platform !== 'win32')('keeps the file readable by Toppo only', async () => {
    const files = await createTestFileStorage();
    const received = await files.receive(bodyOf('secret'), '6');

    expect(statSync(received.path).mode & 0o777).toBe(0o600);
    expect(statSync(dirname(received.path)).mode & 0o777).toBe(0o700);
  });

  it('refuses, before reading anything, a body without a length, empty, or too large', async () => {
    const files = await createTestFileStorage({ maxFileSize: 10 });

    expect(await refusal(() => files.receive(bodyOf('abc'), undefined))).toStrictEqual({
      status: 411,
      code: 'LENGTH_REQUIRED',
    });
    expect(await refusal(() => files.receive(bodyOf('abc'), '3 ; 4'))).toMatchObject({
      status: 411,
    });
    expect(await refusal(() => files.receive(bodyOf(''), '0'))).toStrictEqual({
      status: 400,
      code: 'ATTACHMENT_EMPTY',
    });
    expect(await refusal(() => files.receive(bodyOf('x'.repeat(11)), '11'))).toStrictEqual({
      status: 413,
      code: 'ATTACHMENT_TOO_LARGE',
    });
  });

  it('refuses a body longer or shorter than it announced, leaving nothing behind', async () => {
    const files = await createTestFileStorage({ maxFileSize: 10 });

    expect(await refusal(() => files.receive(bodyOf('12345', '67890'), '4'))).toStrictEqual({
      status: 413,
      code: 'ATTACHMENT_TOO_LARGE',
    });
    expect(await refusal(() => files.receive(bodyOf('123'), '4'))).toStrictEqual({
      status: 400,
      code: 'UPLOAD_INCOMPLETE',
    });
    expect(await files.sweep(() => Promise.resolve(new Set()))).toBe(0);
  });

  it('stops before the disk is full, keeping room for the database', async () => {
    const files = await createTestFileStorage({
      freeSpace: () => Promise.resolve(1024 * 1024 * 1024 + 100),
    });

    expect((await files.receive(bodyOf('x'.repeat(100)), '100')).size).toBe(100);
    expect(await refusal(() => files.receive(bodyOf('x'.repeat(101)), '101'))).toStrictEqual({
      status: 507,
      code: 'STORAGE_FULL',
    });
  });
});

describe('keeping a file', () => {
  it('moves it under a new random key, to send it later', async () => {
    const files = await createTestFileStorage();
    const received = await files.receive(bodyOf('Numéro;Montant\n'), '16');

    const first = await files.keep(received);
    const second = await files.keep(await files.receive(bodyOf('again'), '5'));

    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
    expect(await text(await files.open(first))).toBe('Numéro;Montant\n');
    expect(() => statSync(received.path)).toThrow();
  });

  it('keeps only what it received itself, and opens only what it kept', async () => {
    const files = await createTestFileStorage();
    const elsewhere = new ReceivedFile({
      path: '/etc/passwd',
      size: 1,
      head: new Uint8Array(),
      text: true,
    });

    await expect(files.keep(elsewhere)).rejects.toThrow('Only a file received here can be kept');
    await expect(files.open('../../etc/passwd')).rejects.toThrow('Invalid storage key');
  });

  it('removes a file no command kept', async () => {
    const files = await createTestFileStorage();
    const received = await files.receive(bodyOf('draft'), '5');

    await files.discard(received);
    await files.discard(received);

    expect(() => statSync(received.path)).toThrow();
  });
});

describe('sweeping files', () => {
  it('removes, once an hour old, the files nothing names and those left half-way', async () => {
    const files = await createTestFileStorage();
    const kept = await files.keep(await files.receive(bodyOf('kept'), '4'));
    const forgotten = await files.keep(await files.receive(bodyOf('forgotten'), '9'));
    const recent = await files.keep(await files.receive(bodyOf('recent'), '6'));
    const leftover = await files.receive(bodyOf('leftover'), '8');
    const root = dirname(dirname(leftover.path));
    const pathOf = (key: string) => join(root, key.slice(0, 2), key);
    for (const path of [pathOf(kept), pathOf(forgotten), leftover.path]) {
      utimesSync(path, anHourAgo(), anHourAgo());
    }
    // Not Toppo's: left alone.
    writeFileSync(join(root, 'README'), 'mine');

    const asked: string[] = [];
    const removed = await files.sweep((keys) => {
      asked.push(...keys);
      return Promise.resolve(new Set([kept]));
    });

    expect(removed).toBe(2);
    expect(new Set(asked)).toStrictEqual(new Set([kept, forgotten, recent]));
    expect(await text(await files.open(kept))).toBe('kept');
    expect(await text(await files.open(recent))).toBe('recent');
    await expect(files.open(forgotten)).rejects.toThrow();
    expect(readdirSync(dirname(leftover.path))).toStrictEqual([]);
    expect(readFileSync(join(root, 'README'), 'utf8')).toBe('mine');
  });
});
