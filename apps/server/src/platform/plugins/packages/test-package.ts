import { API_VERSION, type Manifest, type PluginLogo } from '@toppo-tracker/plugin-sdk/protocol';
import { strToU8, type Zippable, zipSync } from 'fflate';

/** A manifest Toppo accepts, for tests to change what they test. */
export function testManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    id: 'time-tracking',
    name: 'plugin.name',
    description: 'plugin.description',
    apiVersion: `^${API_VERSION}`,
    needs: ['issue.read', 'comment.create'],
    permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
    settings: { type: 'object', properties: {} },
    projectSettings: { type: 'object', properties: {} },
    entities: {},
    properties: {},
    messages: {
      en: {
        plugin: { name: 'Time tracking', description: 'Time spent on each issue.' },
        permissions: { log: 'Log time' },
      },
      fr: {
        plugin: { name: 'Suivi du temps', description: 'Le temps passé sur chaque ticket.' },
        permissions: { log: 'Saisir du temps' },
      },
    },
    actions: [{ name: 'timeEntry.log', access: 'authenticated', input: {} }],
    events: ['issue.statusChanged'],
    pages: [],
    panels: [],
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
  logo,
  screens,
  files,
}: {
  manifest?: unknown;
  version?: string;
  /** What it runs (`testBundle`). */
  run?: string;
  /** A file beside its bundle, which its manifest names `logo`, or not. */
  logo?: { name: PluginLogo; bytes: Uint8Array };
  /** Its screens' bundle, `web.js`, if it has one. */
  screens?: string;
  files?: Zippable;
} = {}): Buffer {
  return Buffer.from(
    zipSync(
      files ?? {
        'server.js': strToU8(testBundle(manifest, run)),
        'plugin.json': strToU8(JSON.stringify({ version })),
        ...(logo ? { [logo.name]: logo.bytes } : {}),
        ...(screens === undefined ? {} : { 'web.js': strToU8(screens) }),
      },
    ),
  );
}

/** The smallest PNG: one pixel. */
export const TEST_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 6, 0, 0, 0, 0x1f, 0x15, 0xc4, 0x89, 0, 0, 0, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78,
  0x9c, 0x63, 0xf8, 0xff, 0x99, 0x01, 0, 0x05, 0x06, 0x02, 0x7f, 0x4f, 0x7c, 0x3a, 0xa5, 0, 0, 0, 0,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);
