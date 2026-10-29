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
