import { type Action, type Dialog, type ServedScreens, z } from '@toppo-tracker/plugin-sdk';
import type { FrameMessage, HostMessage, ScreenContext } from '@toppo-tracker/plugin-sdk/protocol';
import {
  BarChart,
  Button,
  formatDuration,
  IssueLink,
  LineChart,
  Menu,
  Meter,
  PersonName,
  type ScreenError,
  Section,
  Stack,
  useActionMutation,
  useActionQuery,
  useCloseDialog,
  useConfirm,
  useDialog,
  useDialogInput,
  usePickIssue,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import './main.tsx';
import { startScreens } from './screen.tsx';

/*
 * A plugin's screen as it draws in its frame: written with `@toppo-tracker/plugin-ui`, drawn by
 * the runtime, reaching Toppo through the bridge only. The page holding the frame is played here
 * by a frame of the test's own.
 */

const ADA = '0190a1a2-0000-7000-8000-000000000001';
const ISSUE = '0190a1a2-0000-7000-8000-000000000101';
const PROJECT = '0190a1a2-0000-7000-8000-000000000201';

const messages = { en: { title: 'Time spent' }, fr: { title: 'Temps passé' } };

const listEntries: Action<z.ZodObject<{ issueId: z.ZodUUID }>, { total: number }> = {
  name: 'timeEntry.list',
  input: z.object({ issueId: z.uuid() }),
};
const logTime: Action<z.ZodObject<{ issueId: z.ZodUUID; minutes: z.ZodInt }>, null> = {
  name: 'timeEntry.log',
  input: z.object({ issueId: z.uuid(), minutes: z.int().min(1) }),
};

function IssueTime() {
  const t = useT({ messages });
  const { issue, user } = useScreen();
  const issueId = issue?.id ?? '';
  const entries = useActionQuery(listEntries, { issueId });
  const log = useActionMutation(logTime);
  const [failure, setFailure] = useState('');
  const logged = (minutes: number) =>
    log.run({ issueId, minutes }).then(
      () => setFailure(''),
      (error: ScreenError) => setFailure(error.code),
    );
  return (
    <Section title={t('title')}>
      <p>{formatDuration(entries.data?.total ?? 0)}</p>
      <PersonName id={user.id} />
      <IssueLink issueKey="WEB-1" />
      <Button onClick={() => logged(0)}>Log nothing</Button>
      <Button onClick={() => logged(30)}>Log 30 minutes</Button>
      {failure ? <p role="alert">{failure}</p> : null}
    </Section>
  );
}

const logTimeDialog = {
  name: 'logTime',
  input: z.object({ issueId: z.uuid() }),
  result: z.object({ minutes: z.int() }),
} satisfies Dialog;

/** What Toppo draws over the page for a screen, and the charts it draws itself. */
function Tools() {
  const confirm = useConfirm();
  const dialog = useDialog(logTimeDialog);
  const pickIssue = usePickIssue();
  const [said, setSaid] = useState('');
  return (
    <Stack>
      <Menu
        label="Actions"
        items={[
          { id: 'edit', label: 'Edit' },
          { id: 'delete', label: 'Delete', tone: 'danger' },
        ]}
        onSelect={(id) => setSaid(`chose ${id}`)}
      />
      <Button
        onClick={() =>
          confirm({ title: 'Delete it?', tone: 'danger' }).then((yes) =>
            setSaid(`confirmed ${yes}`),
          )
        }
      >
        Delete
      </Button>
      <Button
        onClick={() =>
          dialog.open({ issueId: ISSUE }).then((logged) => setSaid(`logged ${logged?.minutes}`))
        }
      >
        Log time
      </Button>
      <Button onClick={() => pickIssue().then((issue) => setSaid(`picked ${issue?.key}`))}>
        Pick
      </Button>
      <BarChart
        title="Days spent"
        format={(days) => `${days} d`}
        bars={[
          { key: 'web', label: 'Website', value: 12, limit: 10 },
          { key: 'ops', label: 'Operations', value: 4, limit: 8 },
          { key: 'app', label: 'Mobile app', value: 6 },
          { key: 'docs', label: 'Docs', value: 2, limit: 14 },
        ]}
      />
      <LineChart
        title="Hours a week"
        points={[
          { key: 'w42', label: 'Week 42', value: 31 },
          { key: 'w43', label: 'Week 43', value: 36 },
          { key: 'w44', label: 'Week 44', value: 28 },
        ]}
      />
      <Meter label="Budget" value={6.5} max={10} format={(days) => `${days} d`} />
      {said ? <p role="status">{said}</p> : null}
    </Stack>
  );
}

/** A dialog: what it was opened with, and what it closes with. */
function LogDialog() {
  const { issueId } = useDialogInput(logTimeDialog);
  const close = useCloseDialog(logTimeDialog);
  return <Button onClick={() => close({ minutes: 45 })}>{`Log 45 minutes on ${issueId}`}</Button>;
}

function Broken(): never {
  throw new Error('The plugin’s own bug');
}

const SCREENS: ServedScreens = {
  id: 'time-tracking',
  messages,
  component: (name) =>
    (
      ({
        issueTime: async () => IssueTime,
        tools: async () => Tools,
        logTime: async () => LogDialog,
        broken: async () => Broken,
      }) as Record<string, () => Promise<unknown>>
    )[name] ?? undefined,
};

const CONTEXT: ScreenContext = {
  kind: 'context',
  locale: 'fr',
  user: { id: ADA, name: 'Ada Lovelace' },
  screen: 'issueTime',
  search: {},
  issue: { id: ISSUE, key: 'WEB-1', projectId: PROJECT, projectKey: 'WEB' },
  project: null,
  input: null,
};

let host: Window;
let posted: FrameMessage[];

/** What the frame asked Toppo, of one kind. */
function asked<K extends FrameMessage['kind']>(kind: K): Extract<FrameMessage, { kind: K }>[] {
  return posted.filter(
    (message): message is Extract<FrameMessage, { kind: K }> => message.kind === kind,
  );
}

/** A message to the frame, from the page holding it. */
function tell(message: HostMessage): void {
  window.dispatchEvent(new MessageEvent('message', { data: message, source: host }));
}

/** Opens the screen of that name, as Toppo's frame page would, with the page holding it. */
function open(screen: string): void {
  document.documentElement.dataset['screen'] = screen;
  const root = document.body.appendChild(document.createElement('div'));
  root.id = 'root';
  startScreens(SCREENS, host);
}

beforeEach(() => {
  const frame = document.body.appendChild(document.createElement('iframe'));
  if (!frame.contentWindow) {
    throw new Error('The frame has no window');
  }
  host = frame.contentWindow;
  posted = [];
  host.addEventListener('message', (event: MessageEvent<FrameMessage>) => {
    // Cloned here: what comes from the frame is built with its own `Object`.
    posted.push(structuredClone(event.data));
  });
  return () => {
    document.getElementById('root')?.remove();
    frame.remove();
  };
});

describe('a plugin’s screen, in its frame', () => {
  it('draws once Toppo told it where it is, in the person’s language, its plugin reached through Toppo', async () => {
    open('issueTime');
    await expect.poll(() => asked('ready')).toHaveLength(1);
    expect(document.getElementById('root')?.childElementCount).toBe(0);

    tell(CONTEXT);

    await expect.element(page.getByRole('heading', { name: 'Temps passé' })).toBeVisible();
    await expect
      .poll(() => asked('action'))
      .toStrictEqual([
        {
          kind: 'action',
          id: expect.any(Number),
          name: 'timeEntry.list',
          input: { issueId: ISSUE },
          changes: false,
        },
      ]);
    await expect.poll(() => asked('people')).toMatchObject([{ ids: [ADA] }]);
    const [list] = asked('action');
    const [people] = asked('people');
    tell({ kind: 'answer', id: list?.id ?? 0, ok: true, result: { total: 90 } });
    tell({ kind: 'people', id: people?.id ?? 0, people: [{ id: ADA, name: 'Ada Lovelace' }] });

    await expect.element(page.getByText('1 h 30')).toBeVisible();
    await expect.element(page.getByText('Ada Lovelace')).toBeVisible();
    await expect.poll(() => asked('resize').at(-1)?.height ?? 0).toBeGreaterThan(0);
  });

  it('checks an action’s input before running it, then asks again what the screen shows', async () => {
    open('issueTime');
    tell(CONTEXT);
    await expect.poll(() => asked('action')).toHaveLength(1);
    tell({ kind: 'answer', id: asked('action')[0]?.id ?? 0, ok: true, result: { total: 0 } });
    await expect.element(page.getByText('0 min')).toBeVisible();

    await page.getByRole('button', { name: 'Log nothing' }).click();

    await expect.element(page.getByRole('alert')).toHaveTextContent('VALIDATION_FAILED');
    expect(asked('action')).toHaveLength(1);

    await page.getByRole('button', { name: 'Log 30 minutes' }).click();
    await expect
      .poll(() => asked('action').at(-1))
      .toMatchObject({
        name: 'timeEntry.log',
        input: { issueId: ISSUE, minutes: 30 },
        changes: true,
      });
    tell({
      kind: 'answer',
      id: asked('action').at(-1)?.id ?? 0,
      ok: false,
      error: { code: 'FORBIDDEN' },
    });

    await expect.element(page.getByRole('alert')).toHaveTextContent('FORBIDDEN');

    await page.getByRole('button', { name: 'Log 30 minutes' }).click();
    await expect.poll(() => asked('action')).toHaveLength(3);
    tell({ kind: 'answer', id: asked('action').at(-1)?.id ?? 0, ok: true, result: null });

    await expect
      .poll(() => asked('action').map(({ name }) => name))
      .toStrictEqual(['timeEntry.list', 'timeEntry.log', 'timeEntry.log', 'timeEntry.list']);
    // The action succeeds once what the screen shows is asked again.
    tell({ kind: 'answer', id: asked('action').at(-1)?.id ?? 0, ok: true, result: { total: 30 } });

    await expect.element(page.getByText('30 min')).toBeVisible();
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  });

  it('leaves it to Toppo to open an issue, the frame going nowhere', async () => {
    open('issueTime');
    tell(CONTEXT);
    const before = window.location.href;

    await page.getByRole('link', { name: 'WEB-1' }).click();

    await expect
      .poll(() => asked('open'))
      .toStrictEqual([{ kind: 'open', target: { to: 'issue', key: 'WEB-1' } }]);
    expect(window.location.href).toBe(before);
  });

  it.each([
    ['a screen the plugin has not', 'missing'],
    ['a screen that fails as it draws', 'broken'],
  ])('says, in Toppo’s words, it could not show %s', async (_, screen) => {
    open(screen);
    tell({ ...CONTEXT, screen });

    await expect.element(page.getByText('Cet écran n’a pas pu s’afficher.')).toBeVisible();
  });
});

describe('what Toppo draws over the page for a screen', () => {
  /** The tools screen, drawn once Toppo told it where it is. */
  async function tools(): Promise<void> {
    open('tools');
    tell({ ...CONTEXT, screen: 'tools' });
    await expect.element(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  }

  it('asks Toppo for a menu beside its button, and hands the choice to the screen', async () => {
    await tools();
    const button = page.getByRole('button', { name: 'Actions' });

    await button.click();
    await expect.element(button).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => asked('menu')).toHaveLength(1);
    const [menu] = asked('menu');
    expect(menu?.items).toStrictEqual([
      { id: 'edit', label: 'Edit', tone: 'default', disabled: false },
      { id: 'delete', label: 'Delete', tone: 'danger', disabled: false },
    ]);
    expect(menu?.anchor.width).toBeGreaterThan(0);
    tell({ kind: 'answer', id: menu?.id ?? 0, ok: true, result: 'delete' });

    await expect.element(page.getByRole('status')).toHaveTextContent('chose delete');
    await expect.element(button).toHaveAttribute('aria-expanded', 'false');
    await expect.element(button).toHaveFocus();
  });

  it('has Toppo confirm, open a dialog and pick an issue, each answered as Toppo answers', async () => {
    await tools();

    await page.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => asked('confirm')).toHaveLength(1);
    expect(asked('confirm')[0]).toMatchObject({ title: 'Delete it?', tone: 'danger' });
    tell({ kind: 'answer', id: asked('confirm')[0]?.id ?? 0, ok: true, result: true });
    await expect.element(page.getByRole('status')).toHaveTextContent('confirmed true');

    await page.getByRole('button', { name: 'Log time' }).click();
    await expect.poll(() => asked('dialog')).toHaveLength(1);
    expect(asked('dialog')[0]).toMatchObject({ name: 'logTime', input: { issueId: ISSUE } });
    tell({ kind: 'answer', id: asked('dialog')[0]?.id ?? 0, ok: true, result: { minutes: 45 } });
    await expect.element(page.getByRole('status')).toHaveTextContent('logged 45');

    await page.getByRole('button', { name: 'Pick' }).click();
    await expect.poll(() => asked('pick')).toHaveLength(1);
    expect(asked('pick')[0]).toMatchObject({ of: 'issue', multiple: false });
    tell({
      kind: 'answer',
      id: asked('pick')[0]?.id ?? 0,
      ok: true,
      result: { id: ISSUE, key: 'WEB-1', title: 'Invoices', projectId: PROJECT, projectKey: 'WEB' },
    });
    await expect.element(page.getByRole('status')).toHaveTextContent('picked WEB-1');
  });

  it('draws a dialog with what it was opened with, and closes it with what it says', async () => {
    open('logTime');
    tell({ ...CONTEXT, screen: 'logTime', issue: null, input: { issueId: ISSUE } });

    await page.getByRole('button', { name: `Log 45 minutes on ${ISSUE}` }).click();

    await expect
      .poll(() => asked('close'))
      .toStrictEqual([{ kind: 'close', result: { minutes: 45 } }]);

    // Escape reaches the frame, not the page: Toppo is asked to close the dialog, as it closes any.
    await userEvent.keyboard('{Escape}');
    await expect
      .poll(() => asked('close'))
      .toStrictEqual([{ kind: 'close', result: { minutes: 45 } }, { kind: 'close' }]);
  });

  it('draws charts whose figures screen readers read, and says what is past its limit', async () => {
    await tools();

    const bars = page.getByRole('table', { name: 'Days spent' });
    await expect.element(bars.getByRole('row').nth(1)).toHaveTextContent('Website12 d10 d');
    await expect.element(bars.getByRole('row').nth(3)).toHaveTextContent('Mobile app6 d');
    // A limit at the top of the scale is marked inside its bar: past it, the frame would scroll.
    const drawn = document.querySelectorAll<HTMLElement>('figure li > div.relative');
    expect(drawn.length).toBe(4);
    for (const bar of drawn) {
      const mark = bar.lastElementChild?.getBoundingClientRect();
      expect(mark?.right).toBeLessThanOrEqual(bar.getBoundingClientRect().right);
    }
    await expect.element(page.getByText('Dépassé', { exact: true })).toBeVisible();
    await expect
      .element(page.getByRole('meter', { name: 'Budget' }))
      .toHaveAttribute('value', '6.5');
    await expect.element(page.getByText('6.5 d sur 10 d').first()).toBeVisible();
    const hours = page.getByRole('table', { name: 'Hours a week' });
    await expect.element(hours.getByRole('row').nth(3)).toHaveTextContent('Week 4428');

    const line = page.getByRole('img', { name: 'Hours a week' });
    (line.element() as HTMLElement).focus();
    // The readout of the point under focus: the last one first, then the one the arrow reaches.
    await expect.element(line.getByText('28', { exact: true })).toBeVisible();
    await userEvent.keyboard('{ArrowLeft}');
    await expect.element(line.getByText('36', { exact: true })).toBeVisible();
    await expect.element(line.getByText('28', { exact: true })).not.toBeInTheDocument();
  });
});
