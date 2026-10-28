import { mkdtempSync } from 'node:fs';
import { readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPackageStore, type PackageStore } from './package-store.ts';

const OLD = 'a'.repeat(64);
const NEW = 'b'.repeat(64);
const OTHER = 'c'.repeat(64);
let root: string;
let store: PackageStore;

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'toppo-packages-'));
  store = await createPackageStore({ root });
});

/** Makes a file two hours old: past the hour the sweep waits. */
async function age(...path: string[]): Promise<void> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  await utimes(join(root, ...path), twoHoursAgo, twoHoursAgo);
}

describe('the package store', () => {
  it('keeps a package under its plugin and hash, once even if sent twice', async () => {
    await store.keep({ slug: 'time-tracking', sha256: NEW }, new Uint8Array([1, 2, 3]));
    await store.keep({ slug: 'time-tracking', sha256: NEW }, new Uint8Array([1, 2, 3]));

    expect(await readdir(join(root, 'time-tracking'))).toStrictEqual([`${NEW}.zip`]);
    expect([...(await readFile(join(root, 'time-tracking', `${NEW}.zip`)))]).toStrictEqual([
      1, 2, 3,
    ]);
  });

  it('refuses a name that would lead elsewhere', async () => {
    const zip = new Uint8Array([1]);

    await expect(store.keep({ slug: '../uploads', sha256: NEW }, zip)).rejects.toThrow(
      'Invalid plugin slug',
    );
    await expect(store.keep({ slug: 'time-tracking', sha256: '../x' }, zip)).rejects.toThrow(
      'Invalid package hash',
    );
  });

  it('sweeps, once an hour old, the packages and writes no plugin names', async () => {
    const zip = new Uint8Array([1]);
    await store.keep({ slug: 'time-tracking', sha256: OLD }, zip);
    await store.keep({ slug: 'time-tracking', sha256: NEW }, zip);
    await store.keep({ slug: 'reports', sha256: OTHER }, zip);
    await store.keep({ slug: 'uninstalled', sha256: OTHER }, zip);
    const unfinished = '.0123456789abcdef0123456789abcdef.writing';
    await writeFile(join(root, 'reports', unfinished), zip);
    await writeFile(join(root, 'reports', 'notes.txt'), zip);
    for (const file of [
      ['time-tracking', `${OLD}.zip`],
      ['time-tracking', `${NEW}.zip`],
      ['reports', unfinished],
      ['reports', 'notes.txt'],
      ['uninstalled', `${OTHER}.zip`],
    ]) {
      await age(...file);
    }
    const kept = [
      { slug: 'time-tracking', sha256: NEW },
      { slug: 'reports', sha256: OTHER },
    ];

    expect(await store.sweep(kept)).toBe(3);
    expect(await readdir(join(root, 'time-tracking'))).toStrictEqual([`${NEW}.zip`]);
    expect((await readdir(join(root, 'reports'))).sort()).toStrictEqual([
      `${OTHER}.zip`,
      'notes.txt',
    ]);
    expect(await readdir(join(root, 'uninstalled'))).toStrictEqual([]);
    expect(await store.sweep(kept)).toBe(0);
  });

  it('leaves a package no plugin names yet while it is recent: its upload may not have committed', async () => {
    await store.keep({ slug: 'time-tracking', sha256: NEW }, new Uint8Array([1]));

    expect(await store.sweep([])).toBe(0);
    expect(await readdir(join(root, 'time-tracking'))).toStrictEqual([`${NEW}.zip`]);
  });
});
