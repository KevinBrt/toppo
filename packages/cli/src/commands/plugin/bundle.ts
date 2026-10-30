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
  SCREEN_RUNTIME_GLOBAL,
} from '@toppo-tracker/plugin-sdk/protocol';
import { type Plugin, rolldown } from 'rolldown';

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
/** What the server bundle holds in place of a screen's file: nothing, never loaded there. */
const SCREEN_STUB = '\0toppo-screen-stub';
/** Loading a bundle defines its functions: nothing that should take long, as in the sandbox. */
const LOAD_TIMEOUT_MS = 2000;

/**
 * What Toppo's runtime gives every screen in its frame: one React for all plugins, cached once by
 * the browser, which their bundles leave out.
 */
const SCREEN_GLOBALS = {
  react: `${SCREEN_RUNTIME_GLOBAL}.React`,
  'react/jsx-runtime': `${SCREEN_RUNTIME_GLOBAL}.jsxRuntime`,
} as const;

/** What only a screen may import: React, and the components Toppo's runtime draws. */
const SCREEN_ONLY = /^(react|react-dom|@toppo-tracker\/plugin-ui)(\/|$)/;

/** What a bundle is for: Toppo's sandbox on the server, or the screens' frames in a browser. */
type Target = 'server' | 'screens';

/** The definitions whose `handler` runs in Toppo's sandbox only, never in a screen. */
const SERVER_DEFINITIONS = new Set([
  'defineAction',
  'defineEventHandler',
  'defineJob',
  'defineRoute',
]);

/** A property of an AST node, read without trusting its shape. */
const field = (node: unknown, key: string): unknown =>
  typeof node === 'object' && node !== null ? Reflect.get(node, key) : undefined;

/** Where `plugin.defineAction({ …, handler })` holds its handler, if `node` is such a call. */
function handlerRange(node: unknown): [number, number] | undefined {
  const callee = field(node, 'callee');
  const [definition] = (field(node, 'arguments') ?? []) as unknown[];
  if (
    field(node, 'type') !== 'CallExpression' ||
    !SERVER_DEFINITIONS.has(String(field(field(callee, 'property'), 'name'))) ||
    field(definition, 'type') !== 'ObjectExpression'
  ) {
    return undefined;
  }
  const handler = ((field(definition, 'properties') ?? []) as unknown[]).find(
    (property) => field(field(property, 'key'), 'name') === 'handler',
  );
  const range = field(handler, 'range');
  return Array.isArray(range) ? [Number(range[0]), Number(range[1])] : undefined;
}

/** The handlers of the actions, event handlers, jobs and routes a module defines, last first. */
function serverHandlersIn(program: unknown): [number, number][] {
  const found: [number, number][] = [];
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) {
      return;
    }
    const range = handlerRange(node);
    if (range) {
      found.push(range);
    }
    for (const child of Object.values(node)) {
      visit(child);
    }
  };
  visit(program);
  return found.sort(([left], [right]) => right - left);
}

/**
 * The plugin's files: every TypeScript file of `src/` but its tests and declarations, its entry
 * first, with its screens' `.tsx` files for the screens' bundle. Each registers what it defines
 * (`plugin.defineAction`) as it runs: nothing to list.
 */
export async function sourceFilesOf(directory: string, target: Target): Promise<string[]> {
  const entry = join(directory, ENTRY);
  const kept = target === 'screens' ? /(?<!\.test|\.d)\.tsx?$/ : /(?<!\.test|\.d)\.ts$/;
  let found: string[];
  try {
    found = (await readdir(join(directory, 'src'), { recursive: true, withFileTypes: true }))
      .filter((file) => file.isFile() && kept.test(file.name))
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
 * Refuses what a target cannot run: Node's modules anywhere; React and the screens' components on
 * the server, where a screen's `.tsx` file is nothing, never loaded.
 */
function targetPlugin(
  directory: string,
  files: readonly string[],
  target: Target,
  fail: (error: BuildError) => never,
): Plugin {
  return {
    name: 'toppo-plugin',
    resolveId(id, importer) {
      if (id === VIRTUAL_ENTRY) {
        return id;
      }
      const from = importer ? relative(directory, importer) : 'The plugin';
      if (id.startsWith('node:') || builtinModules.includes(id)) {
        fail(
          new BuildError(
            `${from} imports ${id}: plugins run in Toppo's sandbox, without Node's modules`,
          ),
        );
      }
      if (target === 'server' && id.endsWith('.tsx')) {
        return SCREEN_STUB;
      }
      if (target === 'server' && SCREEN_ONLY.test(id)) {
        fail(new BuildError(`${from} imports ${id}: a screen's code goes in its .tsx files`));
      }
      return null;
    },
    // The screens' bundle is served to anyone with its address: a screen needs an action's name
    // and input, never what it does on the server, nor what only that uses.
    transform(code, id) {
      if (target !== 'screens' || !/\.ts$/.test(id) || relative(directory, id).startsWith('..')) {
        return null;
      }
      return serverHandlersIn(this.parse(code, { lang: 'ts', range: true })).reduce(
        (kept, [start, end]) => `${kept.slice(0, start)}handler: undefined${kept.slice(end)}`,
        code,
      );
    },
    load(id) {
      if (id === SCREEN_STUB) {
        return 'export {};';
      }
      return id === VIRTUAL_ENTRY
        ? files.map((file) => `import ${JSON.stringify(file)};`).join('\n')
        : null;
    },
  };
}

async function bundleFor(directory: string, target: Target): Promise<string> {
  const files = await sourceFilesOf(directory, target);
  /** Rolldown wraps a plugin's errors in its own, stack and all: this one is told as it is. */
  let refused: BuildError | undefined;
  const fail = (error: BuildError): never => {
    refused = error;
    throw error;
  };
  const screens = target === 'screens';
  try {
    const build = await rolldown({
      input: VIRTUAL_ENTRY,
      platform: screens ? 'browser' : 'neutral',
      logLevel: 'silent',
      ...(screens ? { external: Object.keys(SCREEN_GLOBALS) } : {}),
      transform: { jsx: { runtime: 'automatic' } },
      plugins: [targetPlugin(directory, files, target, fail)],
    });
    const { output } = await build.generate({
      format: 'iife',
      minify: true,
      codeSplitting: false,
      ...(screens ? { globals: SCREEN_GLOBALS } : {}),
    });
    await build.close();
    return output[0].code;
  } catch (error) {
    throw refused ?? new BuildError(error instanceof Error ? error.message : String(error));
  }
}

/**
 * Bundles the plugin's server files, the SDK and their packages into one classic script, as Toppo
 * loads it: nothing left to import, since the sandbox has no module to import from.
 */
export async function bundle(directory: string): Promise<string> {
  return await bundleFor(directory, 'server');
}

/**
 * Bundles the plugin with its screens into one classic script for their frames, which have no
 * origin and load no module: React left to Toppo's runtime, which runs before it.
 */
export async function bundleScreens(directory: string): Promise<string> {
  return await bundleFor(directory, 'screens');
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
