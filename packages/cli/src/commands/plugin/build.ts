import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from '@toppo-tracker/plugin-sdk';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import { strToU8, zipSync } from 'fflate';
import type { CliCommand } from '../../command.ts';
import { BuildError, bundle, manifestOf } from './bundle.ts';

/** `1.2.0`, `1.2.0-beta.1`: Toppo shows it, and compares it when the plugin is upgraded. */
const versionSchema = z
  .string()
  .regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}(-[0-9A-Za-z.-]{1,40})?$/, 'a version such as 1.2.0');

export interface BuiltPlugin {
  /** The zip to install. */
  file: string;
  manifest: Manifest;
  version: string;
  /** In bytes. */
  size: number;
}

/** The plugin's version, from its `package.json`: written once, where npm keeps it. */
async function versionOf(directory: string): Promise<string> {
  let text: string;
  try {
    text = await readFile(join(directory, 'package.json'), 'utf8');
  } catch {
    throw new BuildError(`No package.json in ${directory}`);
  }
  const read = z.object({ version: versionSchema }).safeParse(JSON.parse(text));
  if (!read.success) {
    throw new BuildError('Its package.json needs a version, such as 1.2.0');
  }
  return read.data.version;
}

/**
 * Bundles a plugin, checks it as Toppo will, and writes the zip an administrator uploads: its
 * server bundle, and its version. Nothing in it says what the plugin may do: Toppo asks its code.
 */
export async function buildPlugin(
  directory: string,
  outDirectory = join(directory, 'dist'),
): Promise<BuiltPlugin> {
  const version = await versionOf(directory);
  const code = await bundle(directory);
  const manifest = manifestOf(code);
  const archive = zipSync(
    { 'server.js': strToU8(code), 'plugin.json': strToU8(JSON.stringify({ version })) },
    { level: 9 },
  );
  await mkdir(outDirectory, { recursive: true });
  const file = join(outDirectory, `${manifest.id}-${version}.zip`);
  await writeFile(file, archive);
  return { file, manifest, version, size: archive.length };
}

function listed(items: readonly string[]): string {
  return items.length === 0 ? 'none' : items.join(', ');
}

export const buildCommand: CliCommand = {
  name: 'build',
  summary: 'Bundles a plugin and checks it as Toppo will, into the zip to upload',
  usage: '[directory] [--out <directory>]',
  async run(args, io) {
    let directory: string;
    let out: string | undefined;
    try {
      const { values, positionals } = parseArgs({
        args: [...args],
        options: { out: { type: 'string' } },
        allowPositionals: true,
      });
      directory = resolve(io.cwd, positionals[0] ?? '.');
      out = values.out === undefined ? undefined : resolve(io.cwd, values.out);
    } catch (error) {
      io.error(`${String(error)}\nUsage: toppo plugin build ${this.usage}`);
      return 2;
    }
    try {
      const built = await buildPlugin(directory, out);
      const { manifest } = built;
      io.out(
        `Built ${manifest.id} ${built.version}: ${relative(io.cwd, built.file)} (${Math.ceil(built.size / 1024)} KB)`,
      );
      io.out(`  needs: ${listed(manifest.needs)}`);
      io.out(`  adds permissions: ${listed(Object.keys(manifest.permissions))}`);
      io.out(`  actions: ${listed(manifest.actions.map((action) => action.name))}`);
      io.out(`  events: ${listed(manifest.events)}`);
      return 0;
    } catch (error) {
      if (error instanceof BuildError) {
        io.error(error.message);
        return 1;
      }
      throw error;
    }
  },
};
