import type { ProjectPlugin } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, fakeProject, fakeServer, renderApp } from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Time tracking, at work in WEB, which may give itself a budget in days. */
const TIME_TRACKING: ProjectPlugin = {
  slug: 'time-tracking',
  name: { en: 'Time tracking', fr: 'Suivi du temps' },
  logoUrl: null,
  fields: [
    {
      name: 'budgetDays',
      kind: 'number',
      label: { en: 'Budget, in days', fr: 'Budget, en jours' },
      help: { en: 'All issues together.', fr: 'Tous tickets confondus.' },
      integer: false,
      min: null,
      max: null,
      default: null,
    },
  ],
  values: {},
  refused: false,
};

/** Ada manages WEB, where the plugins given are at work. */
function server(plugins: ProjectPlugin[]) {
  return fakeServer({
    user: ADA,
    projects: [fakeProject('WEB', 'Website')],
    projectPlugins: { WEB: plugins },
  });
}

const sections = () => page.getByRole('navigation', { name: 'Project sections' });

describe('a project’s plugins', () => {
  it('take what the project sets for itself, each in its own form', async () => {
    const fake = server([TIME_TRACKING]);
    const { screen } = await renderApp({ path: '/projects/WEB/plugins' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
    await expect
      .element(sections().getByRole('link', { name: 'Plugins' }))
      .toHaveAttribute('aria-current', 'page');
    const plugin = screen.getByRole('region', { name: 'Time tracking' });
    const budget = plugin.getByRole('textbox', { name: 'Budget, in days' });
    await expect.element(budget).toHaveAccessibleDescription('All issues together.');
    await budget.fill('22,5');
    await plugin.getByRole('button', { name: 'Save the settings' }).click();

    await expect.element(plugin.getByText('Settings saved.')).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/projects/WEB/plugins/time-tracking/settings',
      body: { values: { budgetDays: 22.5 } },
    });
  });

  it('say an upgrade refuses what the project set, until it is corrected', async () => {
    server([{ ...TIME_TRACKING, values: { budgetDays: 500 }, refused: true }]);
    const { screen } = await renderApp({ path: '/projects/WEB/plugins' });
    const plugin = screen.getByRole('region', { name: 'Time tracking' });

    await expect
      .element(plugin.getByRole('alert'))
      .toHaveTextContent(
        'This version of the plugin refuses these settings: correct them, so that it can be approved again.',
      );
    await plugin.getByRole('textbox', { name: 'Budget, in days' }).fill('50');
    await plugin.getByRole('button', { name: 'Save the settings' }).click();

    await expect.element(plugin.getByRole('alert')).not.toBeInTheDocument();
  });

  it('have a tab once one of them takes settings of the project', async () => {
    server([]);
    const { screen } = await renderApp({ path: '/projects/WEB/plugins' });

    await expect.element(screen.getByText('No plugin takes settings here')).toBeVisible();
    await expect.element(sections().getByRole('link', { name: 'Statuses' })).toBeVisible();
    await expect.element(sections().getByRole('link', { name: 'Plugins' })).not.toBeInTheDocument();
  });

  it('speak French, a budget written as French writes it', async () => {
    fakeServer({
      user: { ...ADA, locale: 'fr' },
      projects: [fakeProject('WEB', 'Website')],
      projectPlugins: { WEB: [{ ...TIME_TRACKING, values: { budgetDays: 22.5 } }] },
    });
    const { screen } = await renderApp({ path: '/projects/WEB/plugins', locale: 'fr' });

    await expect
      .element(
        screen
          .getByRole('region', { name: 'Suivi du temps' })
          .getByRole('textbox', { name: 'Budget, en jours' }),
      )
      .toHaveValue('22,5');
  });
});
