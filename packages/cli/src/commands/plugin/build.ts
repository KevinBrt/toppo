import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from '@toppo-tracker/plugin-sdk';
import {
  logoTypeOf,
  type Manifest,
  PLUGIN_LOGO_TYPES,
  PLUGIN_PACKAGE_FILES,
  PLUGIN_PACKAGE_LIMITS,
  PLUGIN_VERSION,
  type PluginLogo,
} from '@toppo-tracker/plugin-sdk/protocol';
import { strToU8, zipSync } from 'fflate';
import type { CliCommand } from '../../command.ts';
import { BuildError, bundle, bundleScreens, manifestOf } from './bundle.ts';

const versionSchema = z.string().regex(PLUGIN_VERSION, 'a version such as 1.2.0');

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

/** The logo the plugin names, beside its `package.json`, checked as Toppo will. */
async function logoOf(directory: string, name: PluginLogo): Promise<Uint8Array> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(join(directory, name));
  } catch {
    throw new BuildError(`src/plugin.ts names ${name} as its logo: put it beside package.json`);
  }
  checkLogo(name, bytes);
  return bytes;
}

/** Refuses a logo that is not what its name says, or too heavy. */
export function checkLogo(name: PluginLogo, bytes: Uint8Array): void {
  if (logoTypeOf(bytes) !== PLUGIN_LOGO_TYPES[name]) {
    throw new BuildError(`${name} is no ${PLUGIN_LOGO_TYPES[name].slice('image/'.length)} image`);
  }
  if (bytes.length > PLUGIN_PACKAGE_LIMITS.logoBytes) {
    throw new BuildError(
      `${name} weighs ${Math.ceil(bytes.length / 1024)} KB: Toppo takes at most ${PLUGIN_PACKAGE_LIMITS.logoBytes / 1024} KB`,
    );
  }
}

/** A bundle's bytes, refused past what Toppo takes. */
function sized(what: string, code: string, max: number): Uint8Array {
  const bytes = strToU8(code);
  if (bytes.length > max) {
    throw new BuildError(
      `The ${what} weighs ${Math.ceil(bytes.length / 1024)} KB: Toppo takes at most ${max / 1024} KB`,
    );
  }
  return bytes;
}

/**
 * The zip of a server bundle, its version, its screens' bundle and its logo, if it has them,
 * refused if Toppo would refuse their size.
 */
export function packagePlugin(
  code: string,
  version: string,
  logo?: { name: PluginLogo; bytes: Uint8Array },
  screens?: string,
): Uint8Array {
  const server = sized('server bundle', code, PLUGIN_PACKAGE_LIMITS.serverBytes);
  return zipSync(
    {
      [PLUGIN_PACKAGE_FILES.server]: server,
      [PLUGIN_PACKAGE_FILES.metadata]: strToU8(JSON.stringify({ version })),
      ...(screens === undefined
        ? {}
        : {
            [PLUGIN_PACKAGE_FILES.web]: sized(
              'screens’ bundle',
              screens,
              PLUGIN_PACKAGE_LIMITS.webBytes,
            ),
          }),
      // Already compressed: zipping it again would only cost time.
      ...(logo ? { [logo.name]: [logo.bytes, { level: 0 }] } : {}),
    },
    { level: 9 },
  );
}

/**
 * Bundles a plugin, checks it as Toppo will, and writes the zip an administrator uploads: its
 * server bundle, its version, its screens' bundle when it has pages or panels, and its logo.
 * Nothing in it says what the plugin may do: Toppo asks its code.
 */
export async function buildPlugin(
  directory: string,
  outDirectory = join(directory, 'dist'),
): Promise<BuiltPlugin> {
  const version = await versionOf(directory);
  const code = await bundle(directory);
  const manifest = manifestOf(code);
  const logo = manifest.logo
    ? { name: manifest.logo, bytes: await logoOf(directory, manifest.logo) }
    : undefined;
  const screens =
    manifest.pages.length + manifest.panels.length > 0 ? await bundleScreens(directory) : undefined;
  const archive = packagePlugin(code, version, logo, screens);
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
      io.out(
        `  screens: ${listed([
          ...manifest.pages.map((page) => `${page.name} (${page.zone})`),
          ...manifest.panels.map((panel) => `${panel.name} (${panel.on})`),
        ])}`,
      );
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
