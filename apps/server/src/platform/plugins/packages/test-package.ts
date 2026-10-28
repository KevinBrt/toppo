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

/** A server bundle written straight to the protocol, that declares `manifest`, whatever it is. */
export function testBundle(manifest: unknown): string {
  return `globalThis.__toppo = {
  manifest() { return ${JSON.stringify(JSON.stringify(manifest))}; },
  async run() { throw new Error('Installing a plugin runs nothing of it'); },
};`;
}

/**
 * A plugin's zip as `toppo plugin build` writes it, for tests: give `files` to write other files
 * instead, or the same with other contents.
 */
export function testPackage({
  manifest = testManifest(),
  version = '1.2.0',
  files,
}: {
  manifest?: unknown;
  version?: string;
  files?: Zippable;
} = {}): Buffer {
  return Buffer.from(
    zipSync(
      files ?? {
        'server.js': strToU8(testBundle(manifest)),
        'plugin.json': strToU8(JSON.stringify({ version })),
      },
    ),
  );
}
