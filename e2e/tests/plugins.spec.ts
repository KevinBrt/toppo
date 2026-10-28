import { randomInt } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext } from '@playwright/test';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

/** The reference plugin, as `toppo plugin build` leaves it: `test:e2e` builds it first. */
const PLUGIN = new URL('../../plugins/time-tracking/', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('package.json', PLUGIN), 'utf8')) as {
  version: string;
};
const ZIP = fileURLToPath(new URL(`dist/time-tracking-${version}.zip`, PLUGIN));
const LOG_TIME = '/api/v1/plugins/time-tracking/actions/timeEntry.log';

/** A project of its own with one issue: the id of that issue. */
async function issueInNewProject(request: APIRequestContext, origin: string, key: string) {
  const project = await request.post('/api/v1/projects', {
    headers: { origin },
    data: { key, name: `Hours ${key}` },
  });
  expect(project.status()).toBe(201);
  const issue = await request.post(`/api/v1/projects/${key}/issues`, {
    headers: { origin },
    data: { title: 'Search is slow' },
  });
  expect(issue.status()).toBe(201);
  return ((await issue.json()) as { id: string }).id;
}

// A plugin adds its permission to every role, which other tests read: installed alone, once they
// are done, then uninstalled.
test('an administrator installs a plugin, approves it on a project, uses it, then uninstalls it', {
  tag: '@instance',
}, async ({ page, baseURL }) => {
  const origin = baseURL ?? '';
  const suffix = randomInt(36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  const key = `TT${suffix}`;
  const issueId = await issueInNewProject(page.request, origin, key);
  const elsewhere = await issueInNewProject(page.request, origin, `TO${suffix}`);

  await page.goto('/settings/plugins');
  await expect(page.getByRole('heading', { level: 1, name: 'Plugins' })).toBeVisible();
  await expect(page.getByText('No plugin installed')).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Install a plugin' }).click();
  await (await chooser).setFiles(ZIP);

  // Nothing runs until approved: what it declares comes first.
  await expect(page.getByRole('heading', { level: 1, name: 'Time tracking' })).toBeVisible();
  await expect(page.getByText('Waiting for approval')).toBeVisible();
  await expect(
    page.getByText('Log the time spent on each issue, and see where it went.'),
  ).toBeVisible();
  await expect(page.getByText(`Version ${version}`)).toBeVisible();
  const needs = page.getByRole('region', { name: 'What it does in Toppo' });
  await expect(needs.getByText('See issues')).toBeVisible();
  const permissions = page.getByRole('region', { name: 'Permissions it adds' });
  await expect(permissions.getByText('Log time')).toBeVisible();
  await expect(permissions.getByText('In each project')).toBeVisible();
  const logo = page.getByRole('main').locator('img');
  await expect(logo).toHaveJSProperty('naturalWidth', 256);
  await expectAccessible(page);

  // Set up before it runs: its own code checks the settings, in its sandbox.
  const settings = page.getByRole('region', { name: 'Settings', exact: true });
  const day = settings.getByRole('textbox', { name: 'Hours in a working day' });
  const saveSettings = settings.getByRole('button', { name: 'Save the settings' });
  await expect(day).toHaveAccessibleDescription(
    'The time logged counts in days of this many hours, as projects’ budgets do. Left empty: 8.',
  );
  await day.fill('0');
  await saveSettings.click();
  await expect(settings.getByText('Enter at least 1.')).toBeVisible();
  await day.fill('7');
  await saveSettings.click();
  await expect(settings.getByText('Settings saved.')).toBeVisible();

  await page.getByRole('radio', { name: 'Chosen projects' }).check();
  await page.getByRole('searchbox', { name: 'Search projects' }).fill(key);
  await page.getByRole('checkbox', { name: new RegExp(key) }).check();
  await page.getByRole('button', { name: 'Approve and enable' }).click();
  await expect(page.getByText('Plugin approved and enabled.')).toBeVisible();
  await expect(page.getByText('Enabled', { exact: true })).toBeVisible();
  await expectAccessible(page);

  // On a phone's width too, nothing scrolls sideways.
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow at 320px').toBe(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await expect(day).toHaveValue('7');

  // It runs, in its sandbox, for whoever asks, in the projects it was approved in only.
  const logged = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId, minutes: 90 },
  });
  expect(logged.status()).toBe(200);
  expect(await logged.json()).toMatchObject({ result: { issueId, minutes: 90 } });
  const outside = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId: elsewhere, minutes: 90 },
  });
  expect(outside.status()).toBe(404);

  // Roles give its permission like Toppo's own.
  await page.goto('/settings/roles');
  const logTime = page.getByRole('switch', { name: /^Log time, / });
  await expect(logTime.first()).toBeVisible();

  await page.goto('/settings/plugins');
  await expect(
    page.getByRole('list', { name: 'Plugins installed' }).locator('img'),
  ).toHaveJSProperty('naturalWidth', 256);
  await page.getByRole('link', { name: 'Time tracking' }).click();
  await page.getByRole('button', { name: 'Uninstall' }).click();
  const confirm = page.getByRole('dialog', { name: 'Uninstall Time tracking?' });
  await expectAccessible(page);
  await confirm.getByRole('button', { name: 'Uninstall the plugin' }).click();
  await expect(page.getByText('No plugin installed')).toBeVisible();

  // Gone with its permission.
  await page.goto('/settings/roles');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(logTime).toHaveCount(0);
  const gone = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId, minutes: 90 },
  });
  expect(gone.status()).toBe(404);
});
