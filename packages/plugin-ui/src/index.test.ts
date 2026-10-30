import { type Action, type Dialog, z } from '@toppo-tracker/plugin-sdk';
import { SCREEN_RUNTIME_GLOBAL } from '@toppo-tracker/plugin-sdk/protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScreenState, ScreenUi } from './contract.ts';
import {
  BarChart,
  Button,
  formatDuration,
  Menu,
  ScreenError,
  useActionMutation,
  useActionQuery,
  useCloseDialog,
  useConfirm,
  useDialog,
  useDialogInput,
  usePeople,
  usePickIssue,
  usePickPeople,
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

const logTimeDialog = {
  name: 'logTime',
  input: z.object({ projectId: z.uuid().optional() }),
  result: z.object({ minutes: z.int() }),
} satisfies Dialog;

const PROJECT = '0190a1a2-0000-7000-8000-000000000100';

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

  it('hands Toppo’s overlays to the runtime: menus, charts, confirmations', async () => {
    const confirm = vi.fn(() => Promise.resolve(true));
    runtime({ Menu: FakeButton, BarChart: FakeButton, useConfirm: () => confirm });
    const onSelect = vi.fn();

    expect(Menu({ label: 'More', items: [{ id: 'edit', label: 'Edit' }], onSelect }).type).toBe(
      FakeButton,
    );
    expect(BarChart({ title: 'Days spent', bars: [] }).type).toBe(FakeButton);
    expect(await useConfirm()({ title: 'Delete?', tone: 'danger' })).toBe(true);
    expect(confirm).toHaveBeenCalledWith({ title: 'Delete?', tone: 'danger' });
  });

  it('opens a dialog by its name, and reads what it closed with by its schema', async () => {
    const open = vi.fn<(name: string, input: unknown) => Promise<unknown>>();
    runtime({ useOpenDialog: () => open });
    const dialog = useDialog(logTimeDialog);

    open.mockResolvedValueOnce({ minutes: 30 });
    expect(await dialog.open({ projectId: PROJECT })).toStrictEqual({ minutes: 30 });
    open.mockResolvedValueOnce(null);
    expect(await dialog.open({})).toBeUndefined();
    open.mockResolvedValueOnce({ minutes: 'thirty' });
    await expect(dialog.open({})).rejects.toMatchObject({ code: 'INVALID_RESULT' });
    open.mockResolvedValueOnce({ anything: true });
    expect(await useDialog({ ...logTimeDialog, result: undefined }).open({})).toBeUndefined();
    expect(open).toHaveBeenCalledWith('logTime', { projectId: PROJECT });
  });

  it('reads a dialog’s input by its schema, and closes it with a result that fits', () => {
    const close = vi.fn();
    let input: unknown = { projectId: PROJECT };
    runtime({ useDialogInput: () => input, useCloseDialog: () => close });

    expect(useDialogInput(logTimeDialog)).toStrictEqual({ projectId: PROJECT });
    input = { projectId: 'WEB' };
    expect(() => useDialogInput(logTimeDialog)).toThrow(ScreenError);

    useCloseDialog(logTimeDialog)({ minutes: 45 });
    useCloseDialog(logTimeDialog)();
    expect(close.mock.calls).toStrictEqual([[{ minutes: 45 }], [undefined]]);
    expect(() =>
      useCloseDialog(logTimeDialog)({ minutes: 'soon' } as unknown as { minutes: number }),
    ).toThrow(ScreenError);
  });

  it('picks issues and people in Toppo’s search, as Toppo answers them', async () => {
    const issue = {
      id: '0190a1a2-0000-7000-8000-000000000042',
      key: 'WEB-42',
      title: 'Invoices fail to download',
      projectId: PROJECT,
      projectKey: 'WEB',
    };
    const pick = vi.fn<(of: string, options: object) => Promise<unknown>>();
    runtime({ usePick: () => pick });

    pick.mockResolvedValueOnce(issue);
    expect(await usePickIssue()({ projectId: PROJECT })).toStrictEqual(issue);
    pick.mockResolvedValueOnce(null);
    expect(await usePickIssue()()).toBeNull();
    pick.mockResolvedValueOnce([{ id: issue.id, name: 'Ada Lovelace' }]);
    expect(await usePickPeople()({ multiple: true })).toStrictEqual([
      { id: issue.id, name: 'Ada Lovelace' },
    ]);
    pick.mockResolvedValueOnce(null);
    expect(await usePickPeople()()).toStrictEqual([]);
    expect(pick.mock.calls).toStrictEqual([
      ['issue', { projectId: PROJECT }],
      ['issue', {}],
      ['people', { multiple: true }],
      ['people', {}],
    ]);
  });
});
