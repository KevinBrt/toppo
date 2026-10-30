import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPluginSandbox, HostCallError, type PluginSandbox } from './plugin-sandbox.ts';
import { MESSAGE_MAX_LENGTH } from './sandbox-protocol.ts';
import { TEST_PLUGIN } from './test-plugin.ts';

const WORKER = new URL('./sandbox-worker.ts', import.meta.url);
const log = Fastify({ logger: false }).log;
const opened: PluginSandbox[] = [];

/** A stand-in worker, for what the real one never does: its source as a `data:` URL. */
function fakeWorker(source: string): URL {
  return new URL(`data:text/javascript,${encodeURIComponent(source)}`);
}

/** Answers its manifest, then ignores every run: a worker stuck past QuickJS's reach. */
const SILENT = fakeWorker(`
  import { parentPort } from 'node:worker_threads';
  parentPort.on('message', (message) => {
    if (message.type === 'manifest') {
      parentPort.postMessage({ type: 'outcome', id: message.id, outcome: { ok: true, value: '{}' } });
    }
  });
`);

/** Dies at its first run. */
const DYING = fakeWorker(`
  import { parentPort } from 'node:worker_threads';
  parentPort.on('message', () => process.exit(1));
`);

/** Tells what environment it was given, as its manifest. */
const ENVIRONMENT = fakeWorker(`
  import { parentPort } from 'node:worker_threads';
  parentPort.on('message', (message) => {
    const value = JSON.stringify(Object.keys(process.env));
    parentPort.postMessage({ type: 'outcome', id: message.id, outcome: { ok: true, value } });
  });
`);

/** Toppo's side of the test plugin's calls. */
function onCall(method: string, args: unknown): Promise<unknown> {
  switch (method) {
    case 'double':
      return Promise.resolve(Number(args) * 2);
    case 'refused':
      return Promise.reject(new HostCallError('FORBIDDEN', 'Not this plugin'));
    default:
      return Promise.reject(new Error('The database is down'));
  }
}

function sandbox(options: { workerUrl?: URL; call?: typeof onCall } = {}): PluginSandbox {
  const opening = createPluginSandbox({
    code: TEST_PLUGIN,
    memoryMb: 32,
    workerUrl: options.workerUrl ?? WORKER,
    onCall: options.call ?? onCall,
    log,
  });
  opened.push(opening);
  return opening;
}

function run(target: PluginSandbox, name: string, payload: unknown = {}, deadlineMs = 300) {
  return target.run({ kind: 'action', name, payload, context: { user: 'ada' }, deadlineMs });
}

afterEach(async () => {
  await Promise.all(opened.splice(0).map((closing) => closing.close()));
  vi.restoreAllMocks();
});

describe('a plugin sandbox in a worker thread', () => {
  it('runs the plugin and answers its calls, in JSON both ways', async () => {
    const call = vi.fn(onCall);
    const plugin = sandbox({ call });

    expect(await plugin.manifest()).toStrictEqual({ ok: true, value: { id: 'test-plugin' } });
    expect(await run(plugin, 'echo', { minutes: 30 })).toStrictEqual({
      ok: true,
      value: { kind: 'action', input: { minutes: 30 }, context: { user: 'ada' } },
    });
    expect(await run(plugin, 'double', 21)).toStrictEqual({ ok: true, value: 42 });
    expect(call).toHaveBeenCalledWith('double', 21);
  });

  it('tells the plugin a refusal by its code, and hides any other failure', async () => {
    const failed = vi.spyOn(log, 'error');
    const plugin = sandbox();

    expect(await run(plugin, 'refused')).toStrictEqual({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: 'FORBIDDEN',
    });
    expect(await run(plugin, 'wait')).toStrictEqual({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: 'INTERNAL_ERROR',
    });
    expect(failed).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'never' }),
      'A plugin call failed',
    );
    expect(await run(plugin, 'call-not-json')).toMatchObject({ detail: 'INVALID_ARGUMENTS' });
  });

  describe('a plugin calling Toppo without waiting', () => {
    let atOnce = 0;
    let most = 0;
    let started = 0;
    let release: () => void = () => undefined;
    /** Toppo's side: each call holds on until the test lets them all go. */
    const held = async (): Promise<unknown> => {
      started += 1;
      atOnce += 1;
      most = Math.max(most, atOnce);
      await new Promise<void>((resolve) => {
        const before = release;
        release = () => {
          before();
          resolve();
        };
      });
      atOnce -= 1;
      return null;
    };

    afterEach(() => {
      release();
      [atOnce, most, started, release] = [0, 0, 0, () => undefined];
    });

    it('has four of its calls worked on at once, and none once its run is over', async () => {
      const plugin = sandbox({ call: held });

      expect(await run(plugin, 'flood', { calls: 50 })).toStrictEqual({ ok: true, value: null });
      release();
      await vi.waitFor(() => expect(atOnce).toBe(0));

      expect(most).toBe(4);
      expect(started).toBe(4);
    });

    it('has a thousand wait their turn at most, and refuses the rest', async () => {
      const plugin = sandbox({ call: held });

      expect(await run(plugin, 'flood-refused', { calls: 1010, refused: 6 })).toStrictEqual({
        ok: true,
        value: [1004, 1005, 1006, 1007, 1008, 1009],
      });
      expect(started).toBe(4);
    });
  });

  it('runs one call at a time, all of them', async () => {
    const plugin = sandbox();

    expect(
      await Promise.all([run(plugin, 'double', 1), run(plugin, 'double', 2), run(plugin, 'echo')]),
    ).toMatchObject([{ value: 2 }, { value: 4 }, { ok: true }]);
  });

  it('starts a new worker once one went past its deadline or its memory', async () => {
    const plugin = sandbox();

    expect(await run(plugin, 'loop', {}, 200)).toStrictEqual({ ok: false, failure: 'TIMEOUT' });
    expect(await run(plugin, 'echo')).toMatchObject({ ok: true });
    expect(await run(plugin, 'arrays', {}, 10_000)).toStrictEqual({
      ok: false,
      failure: 'OUT_OF_MEMORY',
    });
    expect(await run(plugin, 'echo')).toMatchObject({ ok: true });
  });

  it('stops a worker that does not answer in time, and starts another', async () => {
    const plugin = sandbox({ workerUrl: SILENT });
    await plugin.manifest();

    expect(await run(plugin, 'echo', {}, 100)).toStrictEqual({ ok: false, failure: 'TIMEOUT' });
    expect(await plugin.manifest()).toStrictEqual({ ok: true, value: {} });
  });

  it('reports a worker that dies', async () => {
    expect(await run(sandbox({ workerUrl: DYING }), 'echo')).toStrictEqual({
      ok: false,
      failure: 'CRASHED',
    });
  });

  it("gives the worker none of Toppo's environment", async () => {
    expect(await sandbox({ workerUrl: ENVIRONMENT }).manifest()).toStrictEqual({
      ok: true,
      value: [],
    });
  });

  it('takes only JSON for an answer', async () => {
    expect(await run(sandbox(), 'not-json')).toStrictEqual({
      ok: false,
      failure: 'INVALID_ANSWER',
    });
  });

  it('refuses to send a payload over a megabyte', async () => {
    await expect(run(sandbox(), 'echo', 'x'.repeat(MESSAGE_MAX_LENGTH))).rejects.toThrow(
      RangeError,
    );
  });
});
