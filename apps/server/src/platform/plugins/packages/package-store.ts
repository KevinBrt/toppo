import { randomBytes } from 'node:crypto';
import { mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** `time-tracking`: a plugin's folder. Mirrors PLUGIN_ID (`@toppo-tracker/plugin-sdk/protocol`). */
const SLUG = /^[a-z][a-z0-9-]{1,38}[a-z0-9]$/;
/** A package's name on disk: its SHA-256, hex-encoded. */
const PACKAGE = /^([0-9a-f]{64})\.zip$/;
/** A package being written, renamed once whole. */
const WRITING = /^\.[0-9a-f]{32}\.writing$/;
/**
 * How old a package nothing names must be before it is swept: far older than any upload whose
 * transaction is about to name it.
 */
const SWEEP_AFTER_MS = 60 * 60 * 1000;

/** A package kept, as the database names it. */
export interface KeptPackage {
  slug: string;
  sha256: string;
}

/** Plugins' zips on disk, under `<dataDir>/plugins`: `<slug>/<sha256>.zip`. */
export interface PackageStore {
  /** Writes a package, unless it is there already: same name, same content. */
  keep(kept: KeptPackage, zip: Uint8Array): Promise<void>;
  /**
   * Removes the packages `kept` does not name (those of an older version, of an uninstalled
   * plugin, of a transaction rolled back), once an hour old. Folders stay: removing one could race
   * an upload into it. Answers how many it removed.
   */
  sweep(kept: readonly KeptPackage[]): Promise<number>;
}

/** Prepares `root` (readable by Toppo only) and answers the store. */
export async function createPackageStore({ root }: { root: string }): Promise<PackageStore> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const folderOf = (slug: string) => {
    if (!SLUG.test(slug)) {
      throw new Error('Invalid plugin slug');
    }
    return join(root, slug);
  };

  return {
    async keep({ slug, sha256 }, zip) {
      if (!/^[0-9a-f]{64}$/.test(sha256)) {
        throw new Error('Invalid package hash');
      }
      const folder = folderOf(slug);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      const writing = join(folder, `.${randomBytes(16).toString('hex')}.writing`);
      await writeFile(writing, zip, { flag: 'wx', mode: 0o600 });
      await rename(writing, join(folder, `${sha256}.zip`));
    },

    async sweep(kept) {
      const before = Date.now() - SWEEP_AFTER_MS;
      const named = new Set(kept.map(({ slug, sha256 }) => `${slug}/${sha256}`));
      let removed = 0;
      for (const slug of (await readdir(root)).filter((name) => SLUG.test(name))) {
        const folder = folderOf(slug);
        for (const name of await readdir(folder)) {
          const sha256 = PACKAGE.exec(name)?.[1];
          const unnamed = sha256 !== undefined && !named.has(`${slug}/${sha256}`);
          if (
            (unnamed || WRITING.test(name)) &&
            (await removeIfOlder(join(folder, name), before))
          ) {
            removed += 1;
          }
        }
      }
      return removed;
    },
  };
}

/** Whether a file older than `before` was there to remove: another sweep may have taken it. */
async function removeIfOlder(path: string, before: number): Promise<boolean> {
  try {
    if ((await stat(path)).mtimeMs >= before) {
      return false;
    }
    await unlink(path);
    return true;
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
