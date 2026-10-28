import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPackageStore, type PackageStore } from '../packages/package-store.ts';
import { testManifest, testPackage } from '../packages/test-package.ts';
import { createPluginRuntime, type PluginRuntime } from './plugin-runtime.ts';

const WORKER = new URL('../sandbox/sandbox-worker.ts', import.meta.url);
const log = Fastify({ logger: false }).log;
let root: string;
let packages: PackageStore;
let runtime: PluginRuntime;

/** Counts its runs in its own memory, and asks Toppo to double the count. */
const COUNTS = `
  globalThis.runs = (globalThis.runs ?? 0) + 1;
  const doubled = JSON.parse(await __host.call('double', JSON.stringify(globalThis.runs)));
  return JSON.stringify({ ok: true, result: { runs: globalThis.runs, doubled } });
`;

async function keep(version: string) {
  const zip = testPackage({ manifest: testManifest(), version, run: COUNTS });
  const kept = { slug: 'time-tracking', sha256: createHash('sha256').update(zip).digest('hex') };
  await packages.keep(kept, zip);
  return kept;
}

const run = (plugin: { slug: string; sha256: string }) =>
  runtime.run(
    plugin,
    { kind: 'event', name: 'issue.statusChanged', payload: {}, context: {}, deadlineMs: 2000 },
    (method, args) =>
      method === 'double' ? Promise.resolve(Number(args) * 2) : Promise.reject(new Error(method)),
    log,
  );

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'toppo-runtime-'));
  packages = await createPackageStore({ root });
  runtime = createPluginRuntime({ packages, workerUrl: WORKER });
});

afterAll(() => runtime.close());

describe('the plugin runtime', () => {
  it('starts a plugin from its package once, and keeps it for its next runs', async () => {
    const plugin = await keep('1.0.0');

    expect(await run(plugin)).toStrictEqual({
      ok: true,
      value: { ok: true, result: { runs: 1, doubled: 2 } },
    });
    expect(await run(plugin)).toMatchObject({ value: { result: { runs: 2, doubled: 4 } } });
  });

  it('runs a plugin one run after the other, never two at once', async () => {
    const plugin = await keep('1.0.0');

    const outcomes = await Promise.all([run(plugin), run(plugin), run(plugin)]);

    const counts = outcomes.map((outcome) => (outcome.ok ? outcome.value : null));
    expect(new Set(counts.map((count) => JSON.stringify(count))).size).toBe(3);
  });

  it('starts it again from its new package once upgraded', async () => {
    await run(await keep('1.0.0'));

    expect(await run(await keep('2.0.0'))).toMatchObject({ value: { result: { runs: 1 } } });
  });

  it('refuses to start a package changed on the disk since it was installed', async () => {
    const plugin = await keep('3.0.0');
    writeFileSync(join(root, plugin.slug, `${plugin.sha256}.zip`), 'tampered');

    await expect(run(plugin)).rejects.toThrow(
      'The package of time-tracking is not the one installed',
    );
  });
});
