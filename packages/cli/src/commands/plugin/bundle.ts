import { readdir } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { join, relative } from 'node:path';
import vm from 'node:vm';
import { z } from '@toppo-tracker/plugin-sdk';
import {
  HOST_GLOBAL,
  isApiCompatible,
  type Manifest,
  manifestSchema,
  PLUGIN_GLOBAL,
} from '@toppo-tracker/plugin-sdk/protocol';
import { rolldown } from 'rolldown';

/** What stops a build: told to the plugin's author as it is, without a stack. */
export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildError';
  }
}

/** Where a plugin starts: `definePlugin()`. */
export const ENTRY = 'src/plugin.ts';
const VIRTUAL_ENTRY = '\0toppo-plugin-entry';
/** Loading a bundle defines its functions: nothing that should take long, as in the sandbox. */
const LOAD_TIMEOUT_MS = 2000;

/**
 * The plugin's server files: every TypeScript file of `src/` but its tests and declarations, its
 * entry first. Each registers what it defines (`plugin.defineAction`) as it runs: nothing to list.
 */
export async function serverFilesOf(directory: string): Promise<string[]> {
  const entry = join(directory, ENTRY);
  let found: string[];
  try {
    found = (await readdir(join(directory, 'src'), { recursive: true, withFileTypes: true }))
      .filter((file) => file.isFile() && /(?<!\.test|\.d)\.ts$/.test(file.name))
      .map((file) => join(file.parentPath, file.name));
  } catch {
    throw new BuildError(`No src/ folder in ${directory}`);
  }
  if (!found.includes(entry)) {
    throw new BuildError(`No ${ENTRY} in ${directory}: a plugin starts there, with definePlugin()`);
  }
  return [entry, ...found.filter((file) => file !== entry).sort()];
}

/**
 * Bundles the plugin's server files, the SDK and their packages into one classic script, as Toppo
 * loads it: nothing left to import, since the sandbox has no module to import from.
 */
export async function bundle(directory: string): Promise<string> {
  const files = await serverFilesOf(directory);
  /** Rolldown wraps a plugin's errors in its own, stack and all: this one is told as it is. */
  let refused: BuildError | undefined;
  try {
    const build = await rolldown({
      input: VIRTUAL_ENTRY,
      platform: 'neutral',
      logLevel: 'silent',
      plugins: [
        {
          name: 'toppo-plugin',
          resolveId(id, importer) {
            if (id === VIRTUAL_ENTRY) {
              return id;
            }
            if (id.startsWith('node:') || builtinModules.includes(id)) {
              const from = importer ? relative(directory, importer) : 'The plugin';
              refused = new BuildError(
                `${from} imports ${id}: plugins run in Toppo's sandbox, without Node's modules`,
              );
              throw refused;
            }
            return null;
          },
          load(id) {
            return id === VIRTUAL_ENTRY
              ? files.map((file) => `import ${JSON.stringify(file)};`).join('\n')
              : null;
          },
        },
      ],
    });
    const { output } = await build.generate({ format: 'iife', minify: true });
    await build.close();
    return output[0].code;
  } catch (error) {
    throw refused ?? new BuildError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Runs the bundle as Toppo will, in a context of its own with nothing of Node's, then reads and
 * checks the manifest it answers: what Toppo would refuse is refused here first.
 */
export function manifestOf(code: string): Manifest {
  const host = { call: () => Promise.reject(new Error('Toppo is not running this plugin')) };
  const sandbox = vm.createContext({ [HOST_GLOBAL]: host });
  try {
    vm.runInContext(code, sandbox, { filename: 'server.js', timeout: LOAD_TIMEOUT_MS });
  } catch (error) {
    throw new BuildError(`The plugin fails as it loads: ${String(error)}`);
  }
  const served: unknown = Reflect.get(sandbox, PLUGIN_GLOBAL);
  const manifest =
    typeof served === 'object' && served !== null ? Reflect.get(served, 'manifest') : undefined;
  if (typeof manifest !== 'function') {
    throw new BuildError(`${ENTRY} defines no plugin: does it call definePlugin()?`);
  }
  const declared = manifestSchema.safeParse(JSON.parse(String(manifest())));
  if (!declared.success) {
    throw new BuildError(`Toppo would refuse its manifest:\n${z.prettifyError(declared.error)}`);
  }
  if (!isApiCompatible(declared.data.apiVersion)) {
    throw new BuildError(
      `It asks for API ${declared.data.apiVersion}, which this SDK does not speak`,
    );
  }
  return declared.data;
}
