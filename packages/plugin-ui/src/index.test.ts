import { type Action, z } from '@toppo-tracker/plugin-sdk';
import { SCREEN_RUNTIME_GLOBAL } from '@toppo-tracker/plugin-sdk/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScreenState, ScreenUi } from './contract.ts';
import {
  Button,
  formatDuration,
  ScreenError,
  useActionMutation,
  useActionQuery,
  usePeople,
  useScreen,
  useT,
} from './index.ts';

/*
 * What a plugin's screens import hands over to Toppo's runtime: played here by a fake one, as
 * the runtime's own tests play Toppo.
 */

const logTime: Action<z.ZodObject<{ minutes: z.ZodInt }>, { total: number }> = {
  name: 'timeEntry.log',
  input: z.object({ minutes: z.int().min(1) }),
};

const SCREEN: ScreenState = {
  locale: 'fr',
  user: { id: '0190a1a2-0000-7000-8000-000000000001', name: 'Ada Lovelace' },
  issue: null,
  project: null,
  search: {},
  setSearch: () => undefined,
  open: () => undefined,
};

function FakeButton() {
  return null;
}

/** Toppo's runtime, with what a test needs of it. */
function runtime(ui: Partial<ScreenUi>): void {
  Reflect.set(globalThis, SCREEN_RUNTIME_GLOBAL, { ui });
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, SCREEN_RUNTIME_GLOBAL);
});

describe('plugin-ui', () => {
  it('draws with the runtime’s components, under their names', () => {
    runtime({ Button: FakeButton });
    const onClick = vi.fn();

    const element = Button({ children: 'Log', onClick });

    expect(element.type).toBe(FakeButton);
    expect(element.props).toStrictEqual({ children: 'Log', onClick });
  });

  it('refuses to draw outside a screen’s frame', () => {
    expect(() => Button({ children: 'Log' })).toThrow(
      'A screen draws in Toppo, in the frame its runtime prepares',
    );
    runtime(undefined as unknown as ScreenUi);
    expect(() => formatDuration(90)).toThrow('A screen draws in Toppo');
  });

  it('asks the runtime for an action’s answer, by the action’s name', () => {
    const answer = { data: { total: 90 }, error: null, isLoading: false, refetch: vi.fn() };
    const useActionQueryOf = vi.fn(() => answer);
    runtime({ useActionQuery: useActionQueryOf });

    expect(useActionQuery(logTime, { minutes: 30 })).toBe(answer);
    useActionQuery(logTime, { minutes: 30 }, { enabled: false });

    expect(useActionQueryOf.mock.calls).toStrictEqual([
      ['timeEntry.log', { minutes: 30 }, true],
      ['timeEntry.log', { minutes: 30 }, false],
    ]);
  });

  it('runs an action once its input fits, its failure a ScreenError', async () => {
    const run = vi.fn<(input: unknown) => Promise<unknown>>();
    runtime({ useActionMutation: () => ({ run, isPending: false, error: null }) });
    const mutation = useActionMutation(logTime);

    const refused = await mutation.run({ minutes: 0 }).catch((error: unknown) => error);
    run.mockResolvedValueOnce({ total: 30 });
    const done = await mutation.run({ minutes: 30 });
    run.mockRejectedValueOnce({ code: 'entries.closed', params: { key: 'WEB-1' } });
    const failed = await mutation.run({ minutes: 30 }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(ScreenError);
    expect(refused).toMatchObject({
      code: 'VALIDATION_FAILED',
      issues: [{ path: 'minutes', message: expect.any(String) }],
    });
    expect(done).toStrictEqual({ total: 30 });
    expect(run.mock.calls).toStrictEqual([[{ minutes: 30 }], [{ minutes: 30 }]]);
    expect(failed).toBeInstanceOf(ScreenError);
    expect(failed).toMatchObject({
      name: 'ScreenError',
      message: 'entries.closed',
      code: 'entries.closed',
      params: { key: 'WEB-1' },
    });
  });

  it('speaks the plugin’s words in the person’s language', () => {
    runtime({ useScreen: () => SCREEN });
    const t = useT({
      messages: { en: { total: 'Total: {time}' }, fr: { total: 'Total : {time}' } },
    });

    expect(useScreen()).toBe(SCREEN);
    expect(t('total', { time: '1 h 30' })).toBe('Total : 1 h 30');
  });

  it('hands names and durations to the runtime', () => {
    const names = new Map([['0190a1a2-0000-7000-8000-000000000001', 'Ada Lovelace']]);
    runtime({ usePeople: () => names, formatDuration: (minutes) => `${minutes} minutes` });

    expect(usePeople(['0190a1a2-0000-7000-8000-000000000001'])).toBe(names);
    expect(formatDuration(90)).toBe('90 minutes');
  });
});
