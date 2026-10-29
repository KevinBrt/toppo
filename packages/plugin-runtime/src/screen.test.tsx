import { type Action, type ServedScreens, z } from '@toppo-tracker/plugin-sdk';
import type { FrameMessage, HostMessage } from '@toppo-tracker/plugin-sdk/protocol';
import {
  Button,
  formatDuration,
  IssueLink,
  PersonName,
  type ScreenError,
  Section,
  useActionMutation,
  useActionQuery,
  useScreen,
  useT,
} from '@toppo-tracker/plugin-ui';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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

function Broken(): never {
  throw new Error('The plugin’s own bug');
}

const SCREENS: ServedScreens = {
  id: 'time-tracking',
  messages,
  component: (name) =>
    ({ issueTime: async () => IssueTime, broken: async () => Broken })[name] ?? undefined,
};

const CONTEXT: HostMessage = {
  kind: 'context',
  locale: 'fr',
  user: { id: ADA, name: 'Ada Lovelace' },
  screen: 'issueTime',
  search: {},
  issue: { id: ISSUE, key: 'WEB-1', projectId: PROJECT, projectKey: 'WEB' },
  project: null,
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
