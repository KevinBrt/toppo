import type { PluginSettingField } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  type FakePlugin,
  fakePlugin,
  fakeServer,
  renderApp,
} from '../../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const SUMMARY_URL: PluginSettingField = {
  name: 'summaryUrl',
  kind: 'text',
  label: { en: 'Weekly summary, to a chat', fr: 'Résumé de la semaine, vers un chat' },
  help: null,
  format: 'url',
  maxLength: null,
  default: null,
  secret: { set: false },
};

/** Time tracking, which tells a chat each week at the address in its settings. */
const TIME_TRACKING = fakePlugin('time-tracking', 'Time tracking', {
  state: 'enabled',
  approval: { by: { id: ADA.id, name: ADA.name }, at: '2026-10-21T08:30:00.000Z' },
  allProjects: true,
  http: {
    kind: 'settings',
    settings: [{ en: 'Weekly summary, to a chat', fr: 'Résumé de la semaine, vers un chat' }],
  },
  jobs: [
    {
      name: 'weeklySummary',
      every: 'week',
      label: { en: 'Sends the time of the week to a chat', fr: 'Envoie le temps au chat' },
    },
  ],
  settings: { fields: [SUMMARY_URL], values: {}, refused: false, refusedProjects: [] },
});

async function openPlugin(plugin: FakePlugin) {
  const server = fakeServer({ user: ADA, plugins: [plugin] });
  const rendered = await renderApp({ path: `/settings/plugins/${plugin.slug}` });
  await expect
    .element(rendered.screen.getByRole('heading', { level: 1, name: 'Time tracking' }))
    .toBeVisible();
  return { server, ...rendered };
}

describe('a plugin reaching outside Toppo', () => {
  it('says where it may send requests and what it does on its own', async () => {
    const { screen } = await openPlugin(TIME_TRACKING);

    const reach = screen.getByRole('region', { name: 'What it reaches outside Toppo' });
    await expect
      .element(reach.getByText('The address typed in its setting “Weekly summary, to a chat”'))
      .toBeVisible();
    const jobs = screen.getByRole('region', { name: 'What it does on its own' });
    await expect
      .element(jobs.getByText('Sends the time of the week to a chat, every week'))
      .toBeVisible();
  });

  it.each([
    [
      ['hooks.slack.com', 'api.toggl.com'],
      ['The site hooks.slack.com', 'The site api.toggl.com'],
    ],
    ['any', ['Any public site, at addresses it chooses itself']],
  ] as const)('names the sites it declared: %s', async (declared, sentences) => {
    const { screen } = await openPlugin({
      ...TIME_TRACKING,
      http: declared === 'any' ? { kind: 'any' } : { kind: 'hosts', hosts: [...declared] },
    });

    const reach = screen.getByRole('region', { name: 'What it reaches outside Toppo' });
    for (const sentence of sentences) {
      await expect.element(reach.getByText(sentence)).toBeVisible();
    }
  });

  it('says it reaches nothing, does nothing on its own, and asks for no host then', async () => {
    const { screen } = await openPlugin({ ...TIME_TRACKING, http: null, jobs: [] });

    await expect
      .element(screen.getByText('Nothing: it sends no request outside Toppo.'))
      .toBeVisible();
    await expect
      .element(
        screen.getByText('Nothing: it acts only when something happens, or someone asks it to.'),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole('textbox', { name: 'Hosts inside your network it may reach' }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('region', { name: 'Its last requests outside Toppo' }))
      .not.toBeInTheDocument();
  });

  it('is given the hosts inside the network an approval names, one per line', async () => {
    const { server, screen } = await openPlugin({ ...TIME_TRACKING, privateHosts: ['10.0.0.12'] });
    const where = screen.getByRole('region', { name: 'Where it acts' });
    const hosts = where.getByRole('textbox', { name: 'Hosts inside your network it may reach' });

    await expect.element(hosts).toHaveValue('10.0.0.12');
    await hosts.fill('chat.internal\n\n  10.0.0.12 ');
    await where.getByRole('button', { name: 'Save' }).click();

    await expect.element(where.getByText('Projects saved.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/plugins/time-tracking/approve',
      body: { projects: 'all', privateHosts: ['chat.internal', '10.0.0.12'] },
    });
  });

  it('shows its last requests: where to and how each went, never what they carried', async () => {
    const { screen } = await openPlugin({
      ...TIME_TRACKING,
      httpCalls: [
        {
          id: '01a1569b-9900-7000-8000-000000000901',
          method: 'POST',
          host: 'hooks.slack.com',
          status: 200,
          error: null,
          durationMs: 182,
          at: '2026-11-02T08:00:00.000Z',
        },
        {
          id: '01a1569b-9900-7000-8000-000000000902',
          method: 'POST',
          host: '10.0.0.12:8065',
          status: null,
          error: 'ADDRESS_NOT_ALLOWED',
          durationMs: 3,
          at: '2026-10-26T08:00:00.000Z',
        },
      ],
    });

    const calls = screen.getByRole('table', {
      name: 'Requests sent outside Toppo, the latest first',
    });
    await expect.element(calls.getByRole('row')).toHaveLength(3);
    await expect.element(calls.getByRole('cell', { name: 'POST hooks.slack.com' })).toBeVisible();
    await expect.element(calls.getByRole('cell', { name: 'Answered 200' })).toBeVisible();
    await expect
      .element(calls.getByRole('cell', { name: 'Address inside the network, refused' }))
      .toBeVisible();
    await expect.element(calls.getByRole('cell', { name: '182 ms' })).toBeVisible();
  });
});

describe('a plugin’s secret setting', () => {
  it('is typed blind, then never shown again: kept when left empty, replaced when typed', async () => {
    const { server, screen } = await openPlugin(TIME_TRACKING);
    const settings = screen.getByRole('region', { name: 'Settings' });
    const secret = settings.getByLabelText('Weekly summary, to a chat');

    await expect.element(secret).toHaveAttribute('type', 'password');
    await expect
      .element(secret)
      .toHaveAccessibleDescription('Kept secret once saved: never shown again.');
    await secret.fill('https://hooks.slack.com/services/T0/B0/x');
    await settings.getByRole('button', { name: 'Save the settings' }).click();

    await expect.element(settings.getByText('Settings saved.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/plugins/time-tracking/settings',
      body: {
        values: { summaryUrl: 'https://hooks.slack.com/services/T0/B0/x' },
        clearSecrets: [],
      },
    });
    await expect.element(secret).toHaveValue('');
    await expect
      .element(secret)
      .toHaveAccessibleDescription('Set, and kept secret: leave it empty to keep it.');
    await settings.getByRole('button', { name: 'Save the settings' }).click();
    await expect
      .poll(() => server.requests.filter(({ method }) => method === 'PUT').at(-1)?.body)
      .toStrictEqual({
        values: {},
        clearSecrets: [],
      });
  });

  it('is removed only when asked to', async () => {
    const { server, screen } = await openPlugin({
      ...TIME_TRACKING,
      settings: {
        ...TIME_TRACKING.settings,
        fields: [{ ...SUMMARY_URL, secret: { set: true } }],
      },
    });
    const settings = screen.getByRole('region', { name: 'Settings' });

    await settings.getByRole('checkbox', { name: 'Remove “Weekly summary, to a chat”' }).click();
    await expect.element(settings.getByLabelText('Weekly summary, to a chat')).toBeDisabled();
    await settings.getByRole('button', { name: 'Save the settings' }).click();

    await expect.element(settings.getByText('Settings saved.')).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/plugins/time-tracking/settings',
      body: { values: {}, clearSecrets: ['summaryUrl'] },
    });
    await expect
      .element(settings.getByRole('checkbox', { name: 'Remove “Weekly summary, to a chat”' }))
      .not.toBeInTheDocument();
  });
});
