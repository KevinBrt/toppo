import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  type FakePlugin,
  fakePlugin,
  fakeProject,
  fakeServer,
  GRACE,
  renderApp,
} from '../../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const APPROVED: FakePlugin['approval'] = {
  by: { id: ADA.id, name: ADA.name },
  at: '2026-10-21T08:30:00.000Z',
};

const TIME_TRACKING = fakePlugin('time-tracking', 'Time tracking', {
  name: { en: 'Time tracking', fr: 'Suivi du temps' },
  description: {
    en: 'Log the time spent on issues.',
    fr: 'Saisissez le temps passé sur les tickets.',
  },
  version: '1.2.0',
  needs: ['issue.read', 'comment.create'],
  permissions: [
    { name: 'entries.log', scope: 'project', label: { en: 'Log time', fr: 'Saisir du temps' } },
    {
      name: 'reports.read',
      scope: 'instance',
      label: { en: 'Read the reports', fr: 'Lire les rapports' },
    },
  ],
  properties: [
    {
      name: { en: 'Time spent', fr: 'Temps passé' },
      type: 'number',
      writtenBy: 'plugin',
      display: 'duration',
    },
    {
      name: { en: 'Estimate', fr: 'Estimation' },
      type: 'date',
      writtenBy: 'people',
      display: null,
    },
  ],
  events: ['issue.statusChanged', 'issue.commented'],
  actions: ['timeEntry.log'],
});

const ENABLED: FakePlugin = { ...TIME_TRACKING, state: 'enabled', approval: APPROVED };

/** Disabled by Toppo, after failing ten times in a row. */
const STOPPED: FakePlugin = {
  ...TIME_TRACKING,
  state: 'disabled',
  approval: APPROVED,
  failures: 10,
  lastFailure: { reason: 'TIMEOUT', during: 'issue.statusChanged' },
};

const zip = (name = 'time-tracking.zip') =>
  new File(['PK'], name, { type: 'application/x-zip-compressed' });

/** The file input of the page: hidden, opened by a button. */
function fileInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) {
    throw new Error('No file input');
  }
  return input;
}

const badge = (text: string) => page.getByText(text, { exact: true });

const breadcrumb = () => page.getByRole('navigation', { name: 'Breadcrumb' });

async function openPlugin(plugin: FakePlugin, more: Parameters<typeof fakeServer>[0] = {}) {
  const server = fakeServer({ user: ADA, plugins: [plugin], ...more });
  const rendered = await renderApp({ path: `/settings/plugins/${plugin.slug}` });
  await expect
    .element(rendered.screen.getByRole('heading', { level: 1, name: 'Time tracking' }))
    .toBeVisible();
  return { server, ...rendered };
}

describe('the list of plugins', () => {
  it('shows each plugin with its version and state, and opens its page', async () => {
    fakeServer({
      user: ADA,
      plugins: [
        ENABLED,
        fakePlugin('github-sync', 'GitHub sync', { version: '0.3.0' }),
        fakePlugin('old-reports', 'Old reports', { state: 'disabled', approval: APPROVED }),
      ],
    });
    const { screen } = await renderApp({ path: '/settings/plugins' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('link', { name: 'Plugins' }),
      )
      .toHaveAttribute('aria-current', 'page');
    const rows = screen.getByRole('list', { name: 'Plugins installed' }).getByRole('listitem');
    // In the server's order: by slug.
    await expect
      .element(rows.nth(0))
      .toHaveTextContent('GitHub syncVersion 0.3.0Waiting for approval');
    await expect.element(rows.nth(1)).toHaveTextContent('Old reportsVersion 1.0.0Disabled');
    await expect.element(rows.nth(2)).toHaveTextContent('Time trackingVersion 1.2.0Enabled');

    await screen.getByRole('link', { name: 'Time tracking' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Time tracking' }))
      .toBeVisible();
    await expect.element(breadcrumb().getByRole('link', { name: 'Plugins' })).toBeVisible();
    await expect.element(breadcrumb().getByText('Time tracking')).toBeVisible();
  });

  it('says when none is installed', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/plugins' });

    await expect
      .element(screen.getByRole('heading', { level: 2, name: 'No plugin installed' }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('list', { name: 'Plugins installed' }))
      .not.toBeInTheDocument();
  });
});

describe('installing a plugin', () => {
  it('sends the zip chosen, then opens the plugin’s page to approve it', async () => {
    const server = fakeServer({ user: ADA, pluginPackage: TIME_TRACKING });
    const { screen } = await renderApp({ path: '/settings/plugins' });
    await expect.element(screen.getByRole('button', { name: 'Install a plugin' })).toBeVisible();

    expect(fileInput().accept).toBe('.zip,application/zip');
    // A zip as Windows types it: sent as application/zip all the same, or the fake server refuses it.
    await userEvent.upload(fileInput(), [zip()]);

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Time tracking' }))
      .toBeVisible();
    await expect.element(badge('Waiting for approval')).toBeVisible();
    await expect
      .element(screen.getByText(/^This plugin does nothing until you approve it/))
      .toBeVisible();
    const upload = server.requests.find(
      ({ method, path }) => method === 'POST' && path === '/api/v1/plugins',
    );
    expect(upload?.body).toBeInstanceOf(File);
  });

  it('says why the server refused the zip', async () => {
    fakeServer({
      user: ADA,
      pluginPackage: { status: 422, code: 'PLUGIN_API_INCOMPATIBLE' },
    });
    const { screen } = await renderApp({ path: '/settings/plugins' });
    await expect.element(screen.getByRole('button', { name: 'Install a plugin' })).toBeVisible();

    await userEvent.upload(fileInput(), [zip()]);

    await expect
      .element(screen.getByRole('alert'))
      .toMatchTextContent(
        'This plugin was written for another version of Toppo. Ask its author for one written for this version.',
      );
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
  });

  it('takes a new version on the plugin’s page, which waits for an approval if it asks for more', async () => {
    const { screen } = await openPlugin(ENABLED, {
      pluginPackage: {
        ...TIME_TRACKING,
        version: '1.3.0',
        packageSha256: 'b'.repeat(64),
        events: [...TIME_TRACKING.events, 'issue.created'],
      },
    });
    await expect.element(badge('Enabled')).toBeVisible();

    await userEvent.upload(fileInput(), [zip('time-tracking-1.3.0.zip')]);

    await expect.element(screen.getByText('Version 1.3.0')).toBeVisible();
    await expect.element(badge('Waiting for approval')).toBeVisible();
    await expect.element(screen.getByText('b'.repeat(64))).toBeVisible();
    await expect.element(screen.getByText('An issue is created')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Approve and enable' })).toBeVisible();
  });
});

describe('a plugin’s page', () => {
  it('gives the address of each route, for its service, to copy', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const url = 'http://localhost:3000/api/v1/plugins/time-tracking/routes/timer.stopped';
    const { screen } = await openPlugin({
      ...TIME_TRACKING,
      routes: [{ name: 'timer.stopped', url }],
    });
    const routes = screen.getByRole('region', { name: 'What calls it from outside Toppo' });

    await expect
      .element(routes.getByRole('textbox', { name: 'Address of timer.stopped' }))
      .toHaveValue(url);
    await routes.getByRole('button', { name: /Copy/ }).click();
    await expect.element(routes.getByRole('button', { name: /Copied/ })).toBeVisible();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(url);
  });

  it('says when no service calls it', async () => {
    const { screen } = await openPlugin(TIME_TRACKING);

    await expect
      .element(screen.getByText('Nothing: no service outside Toppo calls it.'))
      .toBeVisible();
  });

  it('tells what the plugin declares in plain words, not its actions', async () => {
    const { screen } = await openPlugin(TIME_TRACKING);

    await expect.element(screen.getByText('Version 1.2.0')).toBeVisible();
    await expect.element(screen.getByText('Log the time spent on issues.')).toBeVisible();
    await expect.element(screen.getByText(TIME_TRACKING.packageSha256)).toBeVisible();
    await expect.element(screen.getByText('Not approved yet.')).toBeVisible();
    await expect.element(breadcrumb().getByText('Time tracking')).toBeVisible();

    const needs = screen.getByRole('region', { name: 'What it does in Toppo' });
    await expect.element(needs.getByText('See issues')).toBeVisible();
    await expect.element(needs.getByText('Comment', { exact: true })).toBeVisible();

    const permissions = screen.getByRole('region', { name: 'Permissions it adds' });
    await expect
      .element(permissions.getByRole('listitem').filter({ hasText: 'Log time' }))
      .toMatchTextContent('In each project');
    await expect
      .element(permissions.getByRole('listitem').filter({ hasText: 'Read the reports' }))
      .toMatchTextContent('For the whole instance');

    const properties = screen.getByRole('region', { name: 'Properties it adds' });
    await expect
      .element(properties.getByRole('listitem').filter({ hasText: 'Time spent' }))
      .toMatchTextContent('Duration, written by the plugin');
    await expect
      .element(properties.getByRole('listitem').filter({ hasText: 'Estimate' }))
      .toMatchTextContent('Date, typed in by people');

    const events = screen.getByRole('region', { name: 'What it listens to' });
    await expect.element(events.getByText('An issue changes status')).toBeVisible();
    await expect.element(events.getByText('Someone comments on an issue')).toBeVisible();

    await expect.element(screen.getByText('timeEntry.log')).not.toBeInTheDocument();
    // Waiting for an approval: approving enables it.
    await expect.element(screen.getByRole('button', { name: 'Disable' })).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Enable', exact: true }))
      .not.toBeInTheDocument();
  });

  it('says when a plugin declares nothing', async () => {
    fakeServer({ user: ADA, plugins: [fakePlugin('badge', 'Badge')] });
    const { screen } = await renderApp({ path: '/settings/plugins/badge' });

    await expect.element(screen.getByText('It reads and writes nothing in Toppo.')).toBeVisible();
    await expect.element(screen.getByText('It adds no permission.')).toBeVisible();
    await expect
      .element(screen.getByText('Nothing: it acts only when someone asks it to.'))
      .toBeVisible();
  });

  it('approves and enables a plugin in the projects chosen', async () => {
    const { server, screen } = await openPlugin(TIME_TRACKING, {
      projects: [fakeProject('WEB', 'Website'), fakeProject('APP', 'Mobile app')],
    });
    const where = screen.getByRole('region', { name: 'Where it acts' });

    await expect.element(where.getByRole('radio', { name: 'Chosen projects' })).toBeChecked();
    await where.getByRole('button', { name: 'Approve and enable' }).click();
    await expect
      .element(where.getByText('Choose at least one project, or all of them.'))
      .toBeVisible();
    await where.getByRole('checkbox', { name: /Website/ }).click();
    await where.getByRole('button', { name: 'Approve and enable' }).click();

    await expect.element(where.getByText('Plugin approved and enabled.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/plugins/time-tracking/approve',
      body: {
        packageSha256: TIME_TRACKING.packageSha256,
        projects: ['WEB'],
        privateHosts: [],
      },
    });
    await expect.element(badge('Enabled')).toBeVisible();
    await expect.element(screen.getByText(/^Approved by Ada Lovelace on /)).toBeVisible();
    await expect.element(where.getByRole('button', { name: 'Save' })).toBeVisible();
  });

  it('says so when another package was uploaded since it was reviewed', async () => {
    const { server, screen } = await openPlugin(TIME_TRACKING, {
      projects: [fakeProject('WEB', 'Website')],
    });
    const where = screen.getByRole('region', { name: 'Where it acts' });
    server.state.plugins = server.state.plugins.map((plugin) => ({
      ...plugin,
      packageSha256: 'b'.repeat(64),
    }));

    await where.getByRole('checkbox', { name: /Website/ }).click();
    await where.getByRole('button', { name: 'Approve and enable' }).click();

    await expect
      .element(
        where.getByText(
          'A new version of the plugin was installed meanwhile. Reload the page and review it before approving it.',
        ),
      )
      .toBeVisible();
  });

  it('saves where an approved plugin acts: every project, present and future', async () => {
    const web = fakeProject('WEB', 'Website');
    const { server, screen } = await openPlugin(
      { ...ENABLED, projects: [{ id: web.id, key: web.key, name: web.name }] },
      { projects: [web] },
    );
    const where = screen.getByRole('region', { name: 'Where it acts' });

    await expect.element(where.getByRole('button', { name: 'Remove Website' })).toBeVisible();
    await where.getByRole('radio', { name: 'All projects, present and future' }).click();
    await where.getByRole('button', { name: 'Save' }).click();

    await expect.element(where.getByText('Projects saved.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/plugins/time-tracking/approve',
      body: { packageSha256: TIME_TRACKING.packageSha256, projects: 'all', privateHosts: [] },
    });
  });

  it('disables a plugin, then enables it again', async () => {
    const { server, screen } = await openPlugin(ENABLED);

    await screen.getByRole('button', { name: 'Disable' }).click();
    await expect.element(badge('Disabled')).toBeVisible();
    // Saving its projects would enable it too: the button says so.
    await expect.element(screen.getByRole('button', { name: 'Save and enable' })).toBeVisible();
    await screen.getByRole('button', { name: 'Enable', exact: true }).click();

    await expect.element(badge('Enabled')).toBeVisible();
    const calls = server.requests.map(({ method, path }) => `${method} ${path}`);
    expect(calls).toContain('POST /api/v1/plugins/time-tracking/disable');
    expect(calls).toContain('POST /api/v1/plugins/time-tracking/enable');
  });

  it('uninstalls a plugin once confirmed, saying what stays, its data kept unless deleted', async () => {
    const { server, screen } = await openPlugin(ENABLED);

    await screen.getByRole('button', { name: 'Uninstall', exact: true }).click();
    const dialog = screen.getByRole('dialog', { name: 'Uninstall Time tracking?' });
    await expect
      .element(dialog)
      .toMatchTextContent(
        'Its permissions leave the roles. What it wrote in Toppo stays, signed with its name.',
      );
    const kept = dialog.getByRole('group', { name: 'What it kept' });
    await expect
      .element(
        kept.getByRole('radio', { name: 'Keep it: the plugin finds it again if it comes back' }),
      )
      .toBeChecked();
    await kept.getByRole('radio', { name: 'Delete it, for good' }).click();
    await dialog.getByRole('button', { name: 'Uninstall the plugin' }).click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
    await expect.element(screen.getByText('No plugin installed')).toBeVisible();
    expect(server.requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      'DELETE /api/v1/plugins/time-tracking?data=delete',
    );
  });

  it('says Toppo stopped a plugin failing again and again, why, and enables it again', async () => {
    const { server, screen } = await openPlugin(STOPPED);

    const alert = screen.getByRole('alert');
    await expect
      .element(alert)
      .toMatchTextContent(
        'Toppo stopped this plugin: it failed 10 times in a row. It does nothing until you enable it again.',
      );
    await expect
      .element(alert)
      .toMatchTextContent(
        'The last time, it took too long to answer. The server’s log tells more.',
      );
    await expect.element(badge('Stopped after failures')).toBeVisible();
    // One way to enable it: the alert's.
    await expect
      .element(screen.getByRole('button', { name: 'Enable', exact: true }))
      .not.toBeInTheDocument();

    await alert.getByRole('button', { name: 'Enable again' }).click();

    await expect.element(badge('Enabled')).toBeVisible();
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
    expect(server.requests.map(({ method, path }) => `${method} ${path}`)).toContain(
      'POST /api/v1/plugins/time-tracking/enable',
    );
  });

  it('does not say a plugin someone disabled was stopped', async () => {
    const { screen } = await openPlugin({
      ...STOPPED,
      failures: 3,
    });

    await expect.element(badge('Disabled')).toBeVisible();
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Enable', exact: true })).toBeVisible();
  });

  it('answers a plugin not installed like a page that does not exist', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/plugins/nothing-here' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Page not found' }))
      .toBeVisible();
    await expect.element(screen.getByText('No plugin is installed under this name.')).toBeVisible();
  });
});

/** A plugin with a setting of each kind, a reminder saved. */
const SET_UP: FakePlugin = {
  ...TIME_TRACKING,
  settings: {
    fields: [
      {
        name: 'reminderDays',
        kind: 'number',
        label: { en: 'Reminder, in days', fr: 'Rappel, en jours' },
        help: {
          en: 'Days without time logged before one.',
          fr: 'Jours sans temps saisi avant un rappel.',
        },
        integer: true,
        min: 1,
        max: 1000,
        default: null,
      },
      {
        name: 'rate',
        kind: 'number',
        label: { en: 'Hourly rate', fr: 'Taux horaire' },
        help: null,
        integer: false,
        min: null,
        max: null,
        default: 1.5,
      },
      {
        name: 'team',
        kind: 'text',
        label: { en: 'Team', fr: 'Équipe' },
        help: null,
        format: 'text',
        maxLength: 80,
        default: 'Support',
        secret: null,
      },
      {
        name: 'webhookUrl',
        kind: 'text',
        label: { en: 'Webhook', fr: 'Webhook' },
        help: null,
        format: 'url',
        maxLength: null,
        default: null,
        secret: null,
      },
      {
        name: 'replyTo',
        kind: 'text',
        label: { en: 'Reply to', fr: 'Répondre à' },
        help: null,
        format: 'email',
        maxLength: null,
        default: null,
        secret: null,
      },
      {
        name: 'billable',
        kind: 'boolean',
        label: { en: 'Billable', fr: 'Facturable' },
        help: null,
        default: true,
      },
      {
        name: 'period',
        kind: 'choice',
        label: { en: 'Period', fr: 'Période' },
        help: null,
        options: [
          { value: 'week', label: { en: 'A week', fr: 'Une semaine' } },
          { value: 'month', label: { en: 'A month', fr: 'Un mois' } },
        ],
        default: 'week',
      },
    ],
    values: { reminderDays: 8 },
    refused: false,
    refusedProjects: [],
  },
};

describe('a plugin’s settings', () => {
  it('are drawn as their kinds ask, those saved filled in, and saved as typed', async () => {
    const { server, screen } = await openPlugin(SET_UP);
    const settings = screen.getByRole('region', { name: 'Settings' });
    const maximum = settings.getByRole('textbox', { name: 'Reminder, in days' });
    const team = settings.getByRole('textbox', { name: 'Team' });
    const period = settings.getByRole('combobox', { name: 'Period' });

    await expect.element(maximum).toHaveValue('8');
    await expect
      .element(maximum)
      .toHaveAccessibleDescription('Days without time logged before one.');
    await expect.element(team).toHaveValue('');
    await expect.element(team).toHaveAccessibleDescription('Left empty: Support.');
    await expect.element(settings.getByRole('switch', { name: 'Billable' })).toBeChecked();
    await expect.element(period).toHaveValue('');
    await expect
      .element(period.getByRole('option', { name: 'Default (A week)' }))
      .toBeInTheDocument();

    await maximum.fill('12');
    await team.fill('Billing');
    await settings.getByRole('switch', { name: 'Billable' }).click();
    await period.selectOptions('A month');
    await settings.getByRole('button', { name: 'Save the settings' }).click();

    await expect.element(settings.getByText('Settings saved.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/plugins/time-tracking/settings',
      body: {
        values: { reminderDays: 12, team: 'Billing', billable: false, period: 'month' },
        clearSecrets: [],
      },
    });
  });

  it('check what they can before they are sent, then say what the plugin refused', async () => {
    const { server, screen } = await openPlugin(SET_UP, { refusedSettings: ['webhookUrl'] });
    const settings = screen.getByRole('region', { name: 'Settings' });
    const save = settings.getByRole('button', { name: 'Save the settings' });

    await settings.getByRole('textbox', { name: 'Reminder, in days' }).fill('2.5');
    await settings.getByRole('textbox', { name: 'Hourly rate' }).fill('a lot');
    await settings.getByRole('textbox', { name: 'Webhook' }).fill('hooks.example.com');
    await settings.getByRole('textbox', { name: 'Reply to' }).fill('billing');
    await save.click();

    await expect.element(settings.getByText('Enter a whole number.')).toBeVisible();
    await expect.element(settings.getByText('Enter a number.')).toBeVisible();
    await expect
      .element(settings.getByText('Enter a web address, such as https://example.com.'))
      .toBeVisible();
    await expect.element(settings.getByText('Enter a valid email address.')).toBeVisible();
    await settings.getByRole('textbox', { name: 'Reminder, in days' }).fill('1001');
    await save.click();
    await expect.element(settings.getByText('Enter at most 1000.')).toBeVisible();
    expect(server.requests.filter(({ method }) => method === 'PUT')).toStrictEqual([]);

    await settings.getByRole('textbox', { name: 'Reminder, in days' }).fill('0');
    await save.click();
    await expect.element(settings.getByText('Enter at least 1.')).toBeVisible();
    await settings.getByRole('textbox', { name: 'Reminder, in days' }).fill('12');
    await settings.getByRole('textbox', { name: 'Hourly rate' }).clear();
    await settings.getByRole('textbox', { name: 'Webhook' }).fill('https://hooks.example.com');
    await settings.getByRole('textbox', { name: 'Reply to' }).fill('billing@example.com');
    await save.click();

    await expect
      .element(settings.getByRole('alert'))
      .toHaveTextContent('The plugin refuses some of these settings.');
    await expect
      .element(settings.getByRole('textbox', { name: 'Webhook' }))
      .toHaveAccessibleDescription('The plugin refuses this value.');
  });

  it('say an upgrade refuses them, and let it be approved once they are corrected', async () => {
    const { screen } = await openPlugin({
      ...SET_UP,
      settings: { ...SET_UP.settings, refused: true },
    });
    const settings = screen.getByRole('region', { name: 'Settings' });
    const where = screen.getByRole('region', { name: 'Where it acts' });

    await expect
      .element(settings.getByRole('alert'))
      .toHaveTextContent(
        'This version of the plugin refuses its settings: correct them, then approve it again.',
      );
    await where.getByRole('radio', { name: 'All projects, present and future' }).click();
    await where.getByRole('button', { name: 'Approve and enable' }).click();
    await expect
      .element(where.getByRole('alert'))
      .toHaveTextContent('This version refuses the plugin’s settings: correct them first, above.');

    await settings.getByRole('textbox', { name: 'Reminder, in days' }).fill('100');
    await settings.getByRole('button', { name: 'Save the settings' }).click();
    await expect.element(settings.getByRole('alert')).not.toBeInTheDocument();
    await where.getByRole('button', { name: 'Approve and enable' }).click();

    await expect.element(where.getByText('Plugin approved and enabled.')).toBeVisible();
  });

  it('speak French, a decimal written as French writes it', async () => {
    const server = fakeServer({ user: { ...ADA, locale: 'fr' }, plugins: [SET_UP] });
    const { screen } = await renderApp({
      path: '/settings/plugins/time-tracking',
      locale: 'fr',
    });
    const settings = screen.getByRole('region', { name: 'Paramètres' });
    const rate = settings.getByRole('textbox', { name: 'Taux horaire' });

    await expect.element(rate).toHaveAccessibleDescription('Laissé vide : 1,5.');
    await rate.fill('2,5');
    await settings.getByRole('button', { name: 'Enregistrer les paramètres' }).click();

    await expect.element(settings.getByText('Paramètres enregistrés.')).toBeVisible();
    expect(server.requests).toContainEqual(
      expect.objectContaining({
        method: 'PUT',
        body: { values: expect.objectContaining({ rate: 2.5 }), clearSecrets: [] },
      }),
    );
  });

  it('list the projects whose own settings an upgrade refuses, each linked to where it sets them', async () => {
    const { screen } = await openPlugin(
      {
        ...TIME_TRACKING,
        settings: { ...TIME_TRACKING.settings, refusedProjects: [{ key: 'WEB', name: 'Website' }] },
      },
      { projects: [fakeProject('WEB', 'Website')] },
    );
    const alert = screen.getByRole('alert');

    await expect
      .element(alert)
      .toHaveTextContent(
        'This version of the plugin refuses the settings of these projects: correct them in each, then approve it again.Website',
      );
    await expect
      .element(alert.getByRole('link', { name: 'Website' }))
      .toHaveAttribute('href', '/projects/WEB/plugins');
  });

  it('are not drawn for a plugin that has none', async () => {
    const { screen } = await openPlugin(TIME_TRACKING);

    await expect.element(screen.getByRole('region', { name: 'Where it acts' })).toBeVisible();
    await expect.element(screen.getByRole('region', { name: 'Settings' })).not.toBeInTheDocument();
  });
});

describe('the plugins screens', () => {
  it('speak French on a phone, without scrolling sideways', async () => {
    await page.viewport(375, 812);
    fakeServer({ user: { ...ADA, locale: 'fr' }, plugins: [STOPPED] });
    const { screen } = await renderApp({ path: '/settings/plugins', locale: 'fr' });

    await expect
      .element(screen.getByRole('list', { name: 'Plugins installés' }))
      .toHaveTextContent('Suivi du tempsVersion 1.2.0Désactivé');
    await screen.getByRole('link', { name: 'Suivi du temps' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Suivi du temps' }))
      .toBeVisible();
    await expect.element(badge('Arrêté après des échecs')).toBeVisible();
    await expect
      .element(screen.getByRole('alert'))
      .toMatchTextContent('La dernière fois, il a mis trop de temps à répondre.');
    await expect
      .element(
        screen
          .getByRole('region', { name: 'Ce qu’il fait dans Toppo' })
          .getByText('Voir les tickets'),
      )
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole('region', { name: 'Les permissions qu’il ajoute' })
          .getByText('Saisir du temps'),
      )
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole('region', { name: 'Ce qu’il écoute' })
          .getByText('Un ticket change de statut'),
      )
      .toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(375);
  });

  it('are left to those who manage plugins, without asking the server', async () => {
    const server = fakeServer({
      user: { ...GRACE, permissions: ['instance.mail.manage'] },
      plugins: [TIME_TRACKING],
    });
    const { screen, router } = await renderApp({ path: '/settings/plugins' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('link', { name: 'Plugins' }),
      )
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Install a plugin' }))
      .not.toBeInTheDocument();

    await router.navigate({
      to: '/settings/plugins/$pluginSlug',
      params: { pluginSlug: 'time-tracking' },
    });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
    expect(server.requests.some(({ path }) => path.startsWith('/api/v1/plugins'))).toBe(false);
  });
});
