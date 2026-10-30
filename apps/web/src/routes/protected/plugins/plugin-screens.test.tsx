import type { PluginScreen } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  type FakeServer,
  fakeIssue,
  fakeProject,
  fakeServer,
  GRACE,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A screen of time tracking's, with an entry in its menu unless `entry` is false. */
function timeScreen(name: string, en: string, fr: string, entry = true): PluginScreen {
  return {
    pluginSlug: 'time-tracking',
    plugin: { en: 'Time tracking', fr: 'Suivi du temps' },
    name,
    title: { en, fr },
    entry: entry ? { label: { en, fr }, icon: 'clock' } : null,
  };
}

const REPORT = timeScreen('report', 'Time', 'Temps');
const AUDIT = timeScreen('audit', 'Time audit', 'Audit du temps');
const BUDGETS = timeScreen('budgets', 'Budgets', 'Budgets');
const ISSUE_TIME = timeScreen('issueTime', 'Time spent', 'Temps passé', false);

/** The frame a screen draws in, by its title. */
async function frameOf(title: string): Promise<HTMLIFrameElement> {
  const frame = page.getByTitle(title);
  await expect.element(frame).toBeInTheDocument();
  return frame.element() as HTMLIFrameElement;
}

/**
 * A message from a screen's frame, as the browser hands it to the page: from the frame's window,
 * with no origin (`'null'`), unless a test says otherwise.
 */
function fromFrame(
  frame: HTMLIFrameElement,
  data: unknown,
  {
    origin = 'null',
    source = frame.contentWindow,
  }: { origin?: string; source?: Window | null } = {},
): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
}

const actionRuns = (fake: FakeServer) =>
  fake.requests.filter(({ path }) => path.startsWith('/api/v1/plugins/time-tracking/actions/'));

describe('plugins’ pages', () => {
  it('have their entries in the main menu, under their plugin’s name, and draw in a sandboxed frame', async () => {
    fakeServer({ user: GRACE, pluginScreens: { main: [REPORT], settings: [] } });
    const { screen, router } = await renderApp({ path: '/issues' });

    const menu = screen.getByRole('navigation', { name: 'Main navigation' });
    await expect.element(menu.getByText('Time tracking')).toBeVisible();
    await menu.getByRole('link', { name: 'Time' }).click();

    expect(router.state.location.pathname).toBe('/p/time-tracking/report');
    const frame = await frameOf('Time');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-forms');
    expect(frame.getAttribute('src')).toBe('/plugin-screens/time-tracking/report');
    await expect
      .element(screen.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Time'))
      .toBeVisible();
  });

  it('are not found when no plugin the person may use has them there', async () => {
    fakeServer({ user: GRACE, pluginScreens: { main: [REPORT], settings: [AUDIT] } });
    const { screen } = await renderApp({ path: '/p/time-tracking/audit' });

    await expect
      .element(screen.getByText('This plugin page does not exist, or you cannot open it.'))
      .toBeVisible();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('open the settings to whoever may open one of them there, even without Toppo’s own', async () => {
    fakeServer({ user: GRACE, pluginScreens: { main: [], settings: [AUDIT] } });
    const { screen, router } = await renderApp({ path: '/settings' });

    const sections = screen.getByRole('navigation', { name: 'Settings sections' });
    await sections.getByRole('link', { name: 'Time audit' }).click();

    expect(router.state.location.pathname).toBe('/settings/p/time-tracking/audit');
    expect((await frameOf('Time audit')).getAttribute('src')).toBe(
      '/plugin-screens/time-tracking/audit',
    );
  });

  it('are tabs of a project’s settings, for the project shown', async () => {
    fakeServer({
      user: ADA,
      projects: [fakeProject('WEB', 'Website')],
      projectScreens: { WEB: [BUDGETS] },
    });
    const { screen, router } = await renderApp({ path: '/projects/WEB' });

    const sections = screen.getByRole('navigation', { name: 'Project sections' });
    await sections.getByRole('link', { name: 'Budgets' }).click();

    expect(router.state.location.pathname).toBe('/projects/WEB/p/time-tracking/budgets');
    expect((await frameOf('Budgets')).getAttribute('src')).toBe(
      '/plugin-screens/time-tracking/budgets?project=WEB',
    );

    await router.navigate({
      to: '/projects/$projectKey/p/$pluginSlug/$screen',
      params: { projectKey: 'WEB', pluginSlug: 'time-tracking', screen: 'report' },
    });

    await expect
      .element(screen.getByText('This plugin page does not exist, or you cannot open it.'))
      .toBeVisible();
  });

  it('keep the search a screen asks for in the address', async () => {
    fakeServer({ user: GRACE, pluginScreens: { main: [REPORT], settings: [] } });
    const { router } = await renderApp({ path: '/p/time-tracking/report' });
    const frame = await frameOf('Time');

    fromFrame(frame, { kind: 'search', search: { project: 'WEB' } });

    await expect.poll(() => router.state.location.search).toEqual({ project: 'WEB' });
  });
});

describe('plugins’ panels beside an issue', () => {
  function issueServer() {
    return fakeServer({
      user: ADA,
      projects: [fakeProject('WEB', 'Website')],
      issues: [fakeIssue('WEB', 1, 'Invoices fail to download'), fakeIssue('WEB', 2, 'Slow')],
      issuePanels: { 'WEB-1': [ISSUE_TIME] },
      pluginActions: {
        'time-tracking/timeEntry.log': { result: null },
        'time-tracking/timeEntry.edit': { refused: { code: 'errors.closed' } },
      },
    });
  }

  it('show under their title, each in its frame, for the issue shown', async () => {
    issueServer();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await expect.element(screen.getByRole('heading', { name: 'Time spent' })).toBeVisible();
    expect((await frameOf('Time spent')).getAttribute('src')).toBe(
      '/plugin-screens/time-tracking/issueTime?issue=WEB-1',
    );
  });

  it('run their plugin’s actions for the person, and show the issue again once one changed it', async () => {
    const fake = issueServer();
    await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');
    const issueReads = () => fake.requests.filter(({ path }) => path === '/api/v1/issues/WEB-1');
    const readsBefore = issueReads().length;

    fromFrame(frame, {
      kind: 'action',
      id: 1,
      name: 'timeEntry.log',
      input: { minutes: 30 },
      changes: true,
    });

    await expect
      .poll(() => actionRuns(fake))
      .toStrictEqual([
        {
          method: 'POST',
          path: '/api/v1/plugins/time-tracking/actions/timeEntry.log',
          body: { minutes: 30 },
        },
      ]);
    await expect.poll(() => issueReads().length).toBeGreaterThan(readsBefore);
  });

  it('answer only their own frame, holding Toppo’s document, with what fits the protocol', async () => {
    const fake = issueServer();
    await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');
    const log = { kind: 'action', id: 1, name: 'timeEntry.log', input: {}, changes: false };

    fromFrame(frame, log, { source: window });
    fromFrame(frame, log, { origin: window.location.origin });
    fromFrame(frame, { ...log, name: '../users' });
    fromFrame(frame, { kind: 'people', id: 2, ids: ['nobody'] });
    fromFrame(frame, { ...log, id: 3, name: 'timeEntry.edit' });

    // The last one only, which goes through: the plugin refuses it.
    await expect.poll(() => actionRuns(fake)).toHaveLength(1);
    expect(actionRuns(fake)[0]?.path).toBe('/api/v1/plugins/time-tracking/actions/timeEntry.edit');
    expect(fake.requests.some(({ path }) => path.startsWith('/api/v1/people'))).toBe(false);
  });

  it('fit their content, within reason', async () => {
    issueServer();
    await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');

    fromFrame(frame, { kind: 'resize', height: 321.4 });
    await expect.poll(() => frame.style.height).toBe('322px');

    fromFrame(frame, { kind: 'resize', height: 99_999 });
    await expect.poll(() => frame.style.height).toBe('20000px');
  });

  it('lead to issues in Toppo, as their links ask', async () => {
    issueServer();
    const { router } = await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');

    fromFrame(frame, { kind: 'open', target: { to: 'issue', key: 'WEB-2' } });

    await expect.poll(() => router.state.location.pathname).toBe('/issues/WEB-2');
  });

  it('are taken away once their frame holds another document', async () => {
    issueServer();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');

    // Toppo's document, then another: the screen went elsewhere.
    frame.dispatchEvent(new Event('load'));
    frame.dispatchEvent(new Event('load'));

    await expect
      .element(screen.getByText('This plugin’s screen tried to leave Toppo: it was closed.'))
      .toBeVisible();
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('are not there while no plugin shows one beside the issue', async () => {
    issueServer();
    const { screen } = await renderApp({ path: '/issues/WEB-2' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Slow' })).toBeVisible();
    expect(document.querySelector('iframe')).toBeNull();
  });
});

describe('what Toppo draws over the page for a plugin’s screen', () => {
  const DIALOGS = {
    plugin: { en: 'Time tracking', fr: 'Suivi du temps' },
    dialogs: [
      {
        name: 'logTime',
        title: { en: 'Log time', fr: 'Saisir du temps' },
        size: 'medium' as const,
        side: false,
      },
    ],
  };

  /** The panel's frame, focused as the person uses it, and what Toppo answers it. */
  async function panel() {
    const fake = fakeServer({
      user: ADA,
      projects: [fakeProject('WEB', 'Website')],
      issues: [fakeIssue('WEB', 1, 'Invoices fail to download'), fakeIssue('WEB', 2, 'Slow')],
      issuePanels: { 'WEB-1': [ISSUE_TIME] },
      pluginDialogs: { 'time-tracking': DIALOGS },
    });
    const rendered = await renderApp({ path: '/issues/WEB-1' });
    const frame = await frameOf('Time spent');
    // The screen's frame has no origin: nothing of it can be watched. A window of the test's own
    // stands in for it, both ways: what Toppo tells the screen, and what the screen says.
    const stand = document.body.appendChild(document.createElement('iframe')).contentWindow;
    if (!stand) {
      throw new Error('The stand-in has no window');
    }
    Object.defineProperty(frame, 'contentWindow', { get: () => stand, configurable: true });
    const told = vi.spyOn(stand, 'postMessage');
    frame.focus();
    const answers = () =>
      told.mock.calls.map(([message]) => message).filter((message) => message.kind === 'answer');
    return { fake, frame, answers, ...rendered };
  }

  it('asks the person to confirm, naming the plugin, and answers what they chose', async () => {
    const { frame, answers, screen } = await panel();

    fromFrame(frame, {
      kind: 'confirm',
      id: 7,
      title: 'Delete this entry?',
      tone: 'danger',
      confirmLabel: 'Delete',
    });

    const dialog = screen.getByRole('dialog', { name: 'Delete this entry?' });
    await expect.element(dialog.getByText('Asked by Time tracking')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(answers).toStrictEqual([{ kind: 'answer', id: 7, ok: true, result: true }]);
    await expect.element(dialog).not.toBeInTheDocument();
    // Back beside the screen, not into it: it asks again once the person uses it again.
    await expect.poll(() => document.activeElement).toBe(frame.parentElement);
    fromFrame(frame, { kind: 'confirm', id: 17, title: 'Delete another?' });
    await expect.poll(answers).toContainEqual({
      kind: 'answer',
      id: 17,
      ok: false,
      error: { code: 'OVERLAY_REFUSED' },
    });
    frame.focus();
    fromFrame(frame, { kind: 'confirm', id: 18, title: 'Delete another?' });
    await expect.element(screen.getByRole('dialog', { name: 'Delete another?' })).toBeVisible();
  });

  it('opens one of the plugin’s dialogs with its own frame, and answers what it closed with', async () => {
    const { frame, answers, screen } = await panel();

    fromFrame(frame, { kind: 'dialog', id: 8, name: 'logTime', input: { issueId: 'x' } });

    const dialog = screen.getByRole('dialog', { name: 'Log time' });
    const inner = dialog.getByTitle('Log time');
    await expect.element(inner).toHaveAttribute('src', '/plugin-screens/time-tracking/logTime');
    fromFrame(inner.element() as HTMLIFrameElement, { kind: 'close', result: { minutes: 30 } });
    await expect
      .poll(answers)
      .toStrictEqual([{ kind: 'answer', id: 8, ok: true, result: { minutes: 30 } }]);
    await expect.element(dialog).not.toBeInTheDocument();

    frame.focus();
    fromFrame(frame, { kind: 'dialog', id: 9, name: 'logTime', input: null });
    await expect.element(screen.getByRole('dialog', { name: 'Log time' })).toBeVisible();
    // Dismissed by the person: its opener is answered nothing.
    await screen
      .getByRole('dialog', { name: 'Log time' })
      .getByRole('button', { name: 'Close' })
      .click();
    await expect.poll(answers).toContainEqual({ kind: 'answer', id: 9, ok: true, result: null });
  });

  it('draws a menu beside the screen’s button, and answers the item chosen', async () => {
    const { frame, answers, screen } = await panel();

    fromFrame(frame, {
      kind: 'menu',
      id: 10,
      anchor: { x: 8, y: 8, width: 32, height: 32 },
      items: [
        { id: 'edit', label: 'Edit' },
        { id: 'delete', label: 'Delete', tone: 'danger' },
      ],
    });

    await screen.getByRole('menuitem', { name: 'Delete' }).click();
    await expect
      .poll(answers)
      .toStrictEqual([{ kind: 'answer', id: 10, ok: true, result: 'delete' }]);
  });

  it('draws a menu over the screen’s own frame only, wherever it says its button is', async () => {
    const { frame, screen } = await panel();

    fromFrame(frame, {
      kind: 'menu',
      id: 19,
      anchor: { x: 99_999, y: -99_999, width: 32, height: 32 },
      items: [{ id: 'edit', label: 'Edit' }],
    });

    await expect.element(screen.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
    const box = frame.getBoundingClientRect();
    // Where Toppo placed the screen's button, the menu opening beside it.
    const button = document
      .querySelector('span.fixed[aria-haspopup="menu"]')
      ?.getBoundingClientRect();
    expect(button).toBeDefined();
    expect(button?.left).toBeLessThanOrEqual(box.right);
    expect(button?.top).toBeGreaterThanOrEqual(box.top);
  });

  it('searches issues and people for the screen, and answers what was picked', async () => {
    const { fake, frame, answers, screen } = await panel();

    fromFrame(frame, { kind: 'pick', id: 11, of: 'issue' });
    const issues = screen.getByRole('dialog', { name: 'Choose an issue' });
    await issues.getByRole('textbox', { name: 'Search' }).fill('slow');
    // Once the search went to the server: the other issue is no longer found.
    await expect.element(issues.getByRole('button', { name: /WEB-1/ })).not.toBeInTheDocument();
    await issues.getByRole('button', { name: /WEB-2/ }).click();
    await expect.poll(answers).toStrictEqual([
      {
        kind: 'answer',
        id: 11,
        ok: true,
        result: expect.objectContaining({ key: 'WEB-2', title: 'Slow', projectKey: 'WEB' }),
      },
    ]);
    expect(fake.requests).toContainEqual(
      expect.objectContaining({ path: '/api/v1/plugins/time-tracking/pick/issues?search=slow' }),
    );

    frame.focus();
    fromFrame(frame, { kind: 'pick', id: 12, of: 'people', multiple: true });
    const people = screen.getByRole('dialog', { name: 'Choose people' });
    await people.getByRole('button', { name: 'Ada Lovelace' }).click();
    await people.getByRole('button', { name: 'Grace Hopper' }).click();
    await expect
      .element(people.getByRole('button', { name: 'Grace Hopper' }))
      .toHaveAttribute('aria-pressed', 'true');
    await people.getByRole('button', { name: 'Choose (2)' }).click();
    await expect.poll(answers).toContainEqual({
      kind: 'answer',
      id: 12,
      ok: true,
      result: [
        { id: ADA.id, name: 'Ada Lovelace' },
        { id: GRACE.id, name: 'Grace Hopper' },
      ],
    });
  });

  it('draws nothing for a frame the person is not using, one thing at a time, nor a dialog it has not', async () => {
    const { frame, answers, screen } = await panel();
    const refused = (id: number) => ({
      kind: 'answer',
      id,
      ok: false,
      error: { code: 'OVERLAY_REFUSED' },
    });

    frame.blur();
    fromFrame(frame, { kind: 'confirm', id: 13, title: 'Delete?' });
    await expect.poll(answers).toStrictEqual([refused(13)]);

    frame.focus();
    fromFrame(frame, { kind: 'dialog', id: 14, name: 'nowhere', input: null });
    await expect.poll(answers).toContainEqual(refused(14));

    fromFrame(frame, { kind: 'confirm', id: 15, title: 'Delete?' });
    await expect.element(screen.getByRole('dialog', { name: 'Delete?' })).toBeVisible();
    fromFrame(frame, { kind: 'confirm', id: 16, title: 'Again?' });
    await expect.poll(answers).toContainEqual(refused(16));
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });
});
