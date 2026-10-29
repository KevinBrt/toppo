import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { PLUGIN_PACKAGE_LIMITS, SCREEN_RUNTIME_GLOBAL } from '@toppo-tracker/plugin-sdk/protocol';
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildPlugin, checkLogo, packagePlugin } from './build.ts';
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
    expect(Object.keys(files).sort()).toStrictEqual(['logo.png', 'plugin.json', 'server.js']);
    expect(files['logo.png']).toStrictEqual(
      new Uint8Array(await readFile(join(FIXTURES, 'time-tracking', 'logo.png'))),
    );
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
    [
      'declares what Toppo would refuse',
      'refused',
      /Toppo would refuse its manifest:[\s\S]*id[\s\S]*timeEntry\.log acts on an issue: the plugin needs issue\.read\s+→ at actions\[0\]\.access/,
    ],
    ['fails as it loads', 'throws', /The plugin fails as it loads: .*Broken on purpose/],
    [
      'imports React outside its screens',
      'server-react',
      /src[\\/]plugin\.ts imports react: a screen's code goes in its \.tsx files/,
    ],
    ['has no version', 'no-version', /needs a version, such as 1\.2\.0/],
    ['has no src/plugin.ts', 'no-entry', /No src\/plugin\.ts in .*: a plugin starts there/],
    ['is not there', 'missing', /No package\.json in/],
    ['imports a file that is not there', 'unresolved', /missing\.ts/],
    [
      'names a logo it does not have',
      'missing-logo',
      /src\/plugin\.ts names logo\.webp as its logo: put it beside package\.json/,
    ],
  ])('refuses a plugin that %s', async (_, fixture, message) => {
    await expect(buildPlugin(join(FIXTURES, fixture), out)).rejects.toThrow(message);
  });

  it('bundles its screens apart, for their frames, React left to Toppo’s runtime', async () => {
    const built = await buildPlugin(join(FIXTURES, 'screens'), out);
    const files = unzipSync(await readFile(built.file));
    const server = strFromU8(files['server.js'] ?? new Uint8Array());
    const web = strFromU8(files['web.js'] ?? new Uint8Array());

    expect(Object.keys(files).sort()).toStrictEqual(['plugin.json', 'server.js', 'web.js']);
    expect(built.manifest.pages).toStrictEqual([
      {
        name: 'report',
        zone: 'main',
        access: 'authenticated',
        title: 'report',
        nav: { label: 'report', icon: 'clock' },
      },
    ]);
    expect(server).not.toContain('Hours spent on the screen');
    expect(web).toContain('Hours spent on the screen');
    // Served to anyone with its address: what actions, event handlers and jobs do stays on the server.
    for (const serverOnly of ['secret ways', 'Told of the issue', 'Done each week']) {
      expect(server).toContain(serverOnly);
      expect(web).not.toContain(serverOnly);
    }

    // In a frame, after Toppo's runtime: the page it hands over draws with the runtime's React.
    const served: { component(name: string): (() => Promise<unknown>) | undefined }[] = [];
    const runtime = {
      React: { useState: (value: unknown) => [value] },
      jsxRuntime: {
        jsx: (type: unknown, props: unknown) => ({ type, props }),
        jsxs: (type: unknown, props: unknown) => ({ type, props }),
      },
      serve: (screens: (typeof served)[number]) => served.push(screens),
    };
    vm.runInContext(web, vm.createContext({ [SCREEN_RUNTIME_GLOBAL]: runtime }));
    const Page = (await served[0]?.component('report')?.()) as () => unknown;
    expect(JSON.stringify(Page())).toContain('logged by ","hours.log');
  });

  it('refuses a server bundle heavier than Toppo takes, in bytes, before zipping it', () => {
    // Two bytes each in UTF-8: half as many characters as the limit counts bytes.
    const code = `${'é'.repeat(PLUGIN_PACKAGE_LIMITS.serverBytes / 2)};`;

    expect(() => packagePlugin(code, '1.0.0')).toThrow(
      'The server bundle weighs 10241 KB: Toppo takes at most 10240 KB',
    );
  });

  it('refuses a logo that is not what its name says, or too heavy', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    expect(() => checkLogo('logo.png', png)).not.toThrow();
    expect(() => checkLogo('logo.webp', png)).toThrow('logo.webp is no webp image');
    expect(() => checkLogo('logo.png', new TextEncoder().encode('<svg/>'))).toThrow(
      'logo.png is no png image',
    );
    const heavy = new Uint8Array(PLUGIN_PACKAGE_LIMITS.logoBytes + 1);
    heavy.set(png);
    expect(() => checkLogo('logo.png', heavy)).toThrow(
      'logo.png weighs 257 KB: Toppo takes at most 256 KB',
    );
  });

  it('refuses a bundle that defines no plugin', () => {
    expect(() => manifestOf('globalThis.answer = 42;')).toThrow(
      'src/plugin.ts defines no plugin: does it call definePlugin()?',
    );
  });
});
