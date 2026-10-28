import { API_VERSION, type Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import { strToU8, type Zippable, zipSync } from 'fflate';

/** A manifest Toppo accepts, for tests to change what they test. */
export function testManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    id: 'time-tracking',
    apiVersion: `^${API_VERSION}`,
    needs: ['issue.read', 'comment.create'],
    permissions: { 'entries.log': { scope: 'project', label: 'Log time' } },
    settings: {},
    messages: { en: {}, fr: {} },
    actions: [{ name: 'timeEntry.log', access: 'authenticated', input: {} }],
    events: ['issue.statusChanged'],
    ...overrides,
  };
}

/**
 * A server bundle written straight to the protocol, that declares `manifest`, whatever it is, and
 * runs `run`: the body of `async run(kind, name, payload, context)`, its arguments as JSON, which
 * answers a run's answer as JSON, and may `await __host.call(method, args)`.
 */
export function testBundle(
  manifest: unknown,
  run = `throw new Error('This plugin runs nothing');`,
): string {
  return `globalThis.__toppo = {
  manifest() { return ${JSON.stringify(JSON.stringify(manifest))}; },
  async run(kind, name, payload, context) { ${run} },
};`;
}

/**
 * A plugin's zip as `toppo plugin build` writes it, for tests: give `files` to write other files
 * instead, or the same with other contents.
 */
export function testPackage({
  manifest = testManifest(),
  version = '1.2.0',
  run,
  files,
}: {
  manifest?: unknown;
  version?: string;
  /** What it runs (`testBundle`). */
  run?: string;
  files?: Zippable;
} = {}): Buffer {
  return Buffer.from(
    zipSync(
      files ?? {
        'server.js': strToU8(testBundle(manifest, run)),
        'plugin.json': strToU8(JSON.stringify({ version })),
      },
    ),
  );
}
