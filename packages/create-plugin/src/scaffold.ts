import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { PLUGIN_ID } from '@toppo-tracker/plugin-sdk/protocol';
import { templateFiles } from './templates.ts';

/** Why a plugin could not be started, in words its author can act on. */
export class ScaffoldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScaffoldError';
  }
}

/** The version of Toppo's packages a new plugin depends on: this package's own. */
export function ownVersion(): string {
  const manifest: unknown = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  if (typeof manifest !== 'object' || manifest === null || !('version' in manifest)) {
    throw new ScaffoldError('create-plugin cannot read its own version');
  }
  return String(manifest.version);
}

/**
 * Writes a new plugin into `directory`, named after it: the folder must be new or empty, so that
 * nothing of the author's is overwritten. Answers the plugin's id and the files written.
 */
export function scaffold(
  directory: string,
  packagesVersion: string,
  cwd: string,
): { id: string; root: string; files: string[] } {
  const root = resolve(cwd, directory);
  const id = basename(root);
  if (!PLUGIN_ID.test(id)) {
    throw new ScaffoldError(
      `"${id}" cannot name a plugin: 3 to 40 lowercase letters, digits and dashes, starting with a letter, such as my-plugin`,
    );
  }
  if (existsSync(root) && !statSync(root).isDirectory()) {
    throw new ScaffoldError(`${root} is a file: start the plugin in a new folder`);
  }
  if (existsSync(root) && readdirSync(root).length > 0) {
    throw new ScaffoldError(`${root} is not empty: start the plugin in a new folder`);
  }
  const files = templateFiles({ id, packagesVersion });
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, { flag: 'wx' });
  }
  return { id, root, files: Object.keys(files) };
}
