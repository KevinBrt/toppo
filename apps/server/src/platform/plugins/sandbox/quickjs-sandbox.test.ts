import { describe, expect, it, vi } from 'vitest';
import {
  createQuickJsSandbox,
  type QuickJsSandbox,
  SANDBOX_MEMORY_MIN_MB,
} from './quickjs-sandbox.ts';
import { TEST_PLUGIN } from './test-plugin.ts';

/** Toppo's side of the test plugin's calls. */
function answer(method: string, args: string): Promise<string> {
  switch (method) {
    case 'double':
      return Promise.resolve(JSON.stringify(Number(JSON.parse(args)) * 2));
    case 'refused':
      return Promise.reject(new Error('FORBIDDEN'));
    default:
      return new Promise(() => undefined);
  }
}

function sandbox(code = TEST_PLUGIN, call = answer): Promise<QuickJsSandbox> {
  return createQuickJsSandbox({ code, memoryMb: 32, call });
}

function run(target: QuickJsSandbox, name: string, input: unknown = {}, deadlineMs = 300) {
  return target.run({
    kind: 'action',
    name,
    payload: JSON.stringify(input),
    context: JSON.stringify({ user: 'ada' }),
    deadlineMs,
  });
}

describe('a plugin in its sandbox', () => {
  it('answers its manifest, and runs with the payload and context Toppo gives it', async () => {
    const plugin = await sandbox();

    expect(await plugin.manifest()).toStrictEqual({ ok: true, value: '{"id":"test-plugin"}' });
    expect(await run(plugin, 'echo', { minutes: 30 })).toStrictEqual({
      ok: true,
      value: JSON.stringify({ kind: 'action', input: { minutes: 30 }, context: { user: 'ada' } }),
    });
  });

  it('reaches Toppo through `__host.call` alone, in JSON both ways', async () => {
    const call = vi.fn(answer);
    const plugin = await sandbox(TEST_PLUGIN, call);

    expect(await run(plugin, 'double', 21)).toStrictEqual({ ok: true, value: '42' });
    expect(call).toHaveBeenCalledWith('double', '21');
  });

  it('reaches nothing else: no process, file, network, timer or module', async () => {
    const plugin = await sandbox();

    expect(await run(plugin, 'reach')).toStrictEqual({ ok: true, value: '[]' });
    expect(await run(plugin, 'import')).toStrictEqual({ ok: true, value: '"refused"' });
  });

  it('may not call Toppo while its bundle loads', async () => {
    const call = vi.fn(answer);
    const plugin = await sandbox(TEST_PLUGIN, call);

    expect(await run(plugin, 'at-load')).toStrictEqual({
      ok: true,
      value: '"refused: Toppo is not running this plugin"',
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("gets Toppo's refusals as errors it may catch", async () => {
    expect(await run(await sandbox(), 'refused')).toStrictEqual({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: 'FORBIDDEN',
    });
  });

  it.each(['call-huge', 'call-object'])(
    'refuses a call too large or not in JSON: %s',
    async (name) => {
      const call = vi.fn(answer);
      const outcome = await run(await sandbox(TEST_PLUGIN, call), name);

      expect(outcome).toMatchObject({ ok: false, failure: 'PLUGIN_ERROR' });
      expect(call).not.toHaveBeenCalled();
    },
  );

  it.each(['loop', 'regex'])(
    'stops endless work at its deadline, even in a built-in, then is thrown away: %s',
    async (name) => {
      const plugin = await sandbox();
      const started = performance.now();

      expect(await run(plugin, name, {}, 200)).toStrictEqual({ ok: false, failure: 'TIMEOUT' });
      expect(performance.now() - started).toBeLessThan(2000);
      expect(plugin.usable).toBe(false);
      expect(await run(plugin, 'echo')).toMatchObject({ ok: false, failure: 'CRASHED' });
    },
  );

  it.each(['never', 'wait'])('gives up waiting at its deadline: %s', async (name) => {
    const plugin = await sandbox();

    expect(await run(plugin, name, {}, 100)).toStrictEqual({ ok: false, failure: 'TIMEOUT' });
    expect(plugin.usable).toBe(false);
  });

  it.each(['arrays', 'strings'])(
    'stops a plugin past its memory, whatever it allocates: %s',
    async (name) => {
      const plugin = await sandbox();

      expect(await run(plugin, name, {}, 10_000)).toStrictEqual({
        ok: false,
        failure: 'OUT_OF_MEMORY',
      });
      expect(plugin.usable).toBe(false);
    },
  );

  it('takes its errors and wrong answers for what they are, and goes on', async () => {
    const plugin = await sandbox();

    expect(await run(plugin, 'throws')).toStrictEqual({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: 'Nothing to see',
    });
    expect(await run(plugin, 'recurse')).toMatchObject({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: expect.stringMatching(/stack overflow/),
    });
    expect(await run(plugin, 'number')).toStrictEqual({ ok: false, failure: 'INVALID_ANSWER' });
    expect(await run(plugin, 'huge')).toStrictEqual({ ok: false, failure: 'INVALID_ANSWER' });
    expect(plugin.usable).toBe(true);
    expect(await run(plugin, 'echo')).toMatchObject({ ok: true });
  });

  it('reads what it throws without running any of its code', async () => {
    expect(await run(await sandbox(), 'throws-trap')).toStrictEqual({
      ok: false,
      failure: 'PLUGIN_ERROR',
      detail: 'It threw something else than an Error',
    });
  });

  it('runs one call at a time', async () => {
    const plugin = await sandbox();
    const first = run(plugin, 'never', {}, 100);

    await expect(run(plugin, 'echo')).rejects.toThrow('A sandbox runs one call at a time');
    await first;
  });

  it.each([
    ['throws', 'throw new Error("broken")', /broken/],
    ['defines no __toppo', 'globalThis.plugin = {}', /defines no __toppo/],
    [
      'loops in a getter',
      'globalThis.__toppo = { get manifest() { for (;;) {} }, run() {} }',
      /TIMEOUT/,
    ],
  ])('refuses a bundle that %s', async (_, code, detail) => {
    const plugin = await sandbox(code);

    expect(await plugin.manifest()).toMatchObject({
      ok: false,
      failure: 'LOAD_FAILED',
      detail: expect.stringMatching(detail),
    });
    expect(plugin.usable).toBe(false);
  });

  it(`needs ${SANDBOX_MEMORY_MIN_MB} MB of memory at least`, async () => {
    await expect(
      createQuickJsSandbox({ code: TEST_PLUGIN, memoryMb: 8, call: answer }),
    ).rejects.toThrow(RangeError);
  });
});
