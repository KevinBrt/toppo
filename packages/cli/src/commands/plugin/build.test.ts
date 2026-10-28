import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLUGIN_PACKAGE_LIMITS } from '@toppo-tracker/plugin-sdk/protocol';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPlugin, packagePlugin } from './build.ts';
import { manifestOf } from './bundle.ts';

const FIXTURES = fileURLToPath(new URL('../../../test-fixtures/', import.meta.url));
let out: string;

beforeEach(async () => {
  out = await mkdtemp(join(tmpdir(), 'toppo-build-'));
});

afterEach(() => rm(out, { recursive: true, force: true }));

describe('toppo plugin build', () => {
  it('bundles the plugin and every file it defines things in, not its tests, into the zip to upload', async () => {
    const built = await buildPlugin(join(FIXTURES, 'time-tracking'), out);

    expect(built.file).toBe(join(out, 'time-tracking-1.2.0.zip'));
    const files = unzipSync(await readFile(built.file));
    expect(Object.keys(files).sort()).toStrictEqual(['plugin.json', 'server.js']);
    expect(JSON.parse(strFromU8(files['plugin.json'] ?? new Uint8Array()))).toStrictEqual({
      version: '1.2.0',
    });
    expect(manifestOf(strFromU8(files['server.js'] ?? new Uint8Array()))).toMatchObject({
      id: 'time-tracking',
      needs: ['issue.read', 'comment.create'],
      actions: [{ name: 'timeEntry.log' }],
      events: ['issue.statusChanged'],
    });
    expect(built.manifest.id).toBe('time-tracking');
  });

  it.each([
    [
      'uses Node’s modules',
      'node-api',
      /src[\\/]plugin\.ts imports node:fs: plugins run in Toppo's sandbox/,
    ],
    ['declares what Toppo would refuse', 'refused', /Toppo would refuse its manifest:[\s\S]*id/],
    ['fails as it loads', 'throws', /The plugin fails as it loads: .*Broken on purpose/],
    ['has no version', 'no-version', /needs a version, such as 1\.2\.0/],
    ['has no src/plugin.ts', 'no-entry', /No src\/plugin\.ts in .*: a plugin starts there/],
    ['is not there', 'missing', /No package\.json in/],
    ['imports a file that is not there', 'unresolved', /missing\.ts/],
  ])('refuses a plugin that %s', async (_, fixture, message) => {
    await expect(buildPlugin(join(FIXTURES, fixture), out)).rejects.toThrow(message);
  });

  it('refuses a server bundle heavier than Toppo takes, in bytes, before zipping it', () => {
    // Two bytes each in UTF-8: half as many characters as the limit counts bytes.
    const code = `${'é'.repeat(PLUGIN_PACKAGE_LIMITS.serverBytes / 2)};`;

    expect(() => packagePlugin(code, '1.0.0')).toThrow(
      'The server bundle weighs 10241 KB: Toppo takes at most 10240 KB',
    );
  });

  it('refuses a bundle that defines no plugin', () => {
    expect(() => manifestOf('globalThis.answer = 42;')).toThrow(
      'src/plugin.ts defines no plugin: does it call definePlugin()?',
    );
  });
});
