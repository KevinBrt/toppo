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

/** A project of its own with one issue: that issue's id and key. */
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
  return (await issue.json()) as { id: string; key: string };
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
  const { id: issueId, key: issueKey } = await issueInNewProject(page.request, origin, key);
  const { id: elsewhere } = await issueInNewProject(page.request, origin, `TO${suffix}`);

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
  await expect(
    page
      .getByRole('region', { name: 'Properties it adds' })
      .getByRole('listitem')
      .filter({ hasText: 'Time spent' }),
  ).toContainText('Duration, written by the plugin');
  await expect(
    page
      .getByRole('region', { name: 'What it reaches outside Toppo' })
      .getByText('The address typed in its setting “Weekly summary, to a chat”'),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'What it does on its own' })
      .getByText('Sends the time of the week to a chat, every week'),
  ).toBeVisible();
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
  // A secret is typed blind, then never shown again, even once the page is read anew.
  const chat = settings.getByLabel('Weekly summary, to a chat', { exact: true });
  const chatUrl = 'https://hooks.slack.com/services/T0/B0/e2e';
  await chat.fill(chatUrl);
  await saveSettings.click();
  await expect(settings.getByText('Settings saved.')).toBeVisible();
  await expect(chat).toHaveValue('');
  await page.reload();
  await expect(chat).toHaveValue('');
  await expect(chat).toHaveAccessibleDescription(
    /Set, and kept secret: leave it empty to keep it\./,
  );
  await expect(page.getByText(chatUrl)).toHaveCount(0);

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

  // Each project it acts in sets its own budget, in its settings.
  await page.goto(`/projects/${key}`);
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Plugins' })
    .click();
  const ours = page.getByRole('region', { name: 'Time tracking' });
  const budget = ours.getByRole('textbox', { name: 'Budget, in days' });
  await budget.fill('22,5');
  await ours.getByRole('button', { name: 'Save the settings' }).click();
  await expect(ours.getByText('Settings saved.')).toBeVisible();
  await expectAccessible(page);
  await page.reload();
  await expect(budget).toHaveValue('22.5');

  // It runs, in its sandbox, for whoever asks, in the projects it was approved in only.
  const logged = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId, minutes: 90, spentOn: '2026-10-28' },
  });
  expect(logged.status()).toBe(200);
  // Kept by Toppo, as the entry of whoever logged it.
  expect(await logged.json()).toMatchObject({
    result: { issueId, minutes: 90, spentOn: '2026-10-28', createdBy: expect.any(String) },
  });
  // The issue's time spent, written by the plugin, for no one to type in.
  await page.goto(`/issues/${issueKey}`);
  const sidebar = page.getByRole('complementary', { name: 'Properties' });
  await expect(sidebar.getByText('Time spent')).toBeVisible();
  await expect(sidebar.getByText('1 h 30')).toBeVisible();
  await expect(sidebar.getByRole('spinbutton', { name: 'Time spent' })).toHaveCount(0);

  // Beside the issue, the plugin's panel, in a frame of its own: its entries, and a form to log more.
  const panel = page.getByRole('region', { name: 'Time spent' }).frameLocator('iframe');
  await expect(panel.getByText('1 h 30').first()).toBeVisible();
  await panel.getByRole('spinbutton', { name: 'Minutes' }).fill('45');
  await panel.getByRole('button', { name: 'Log time' }).click();
  await expect(panel.getByText('Time logged.')).toBeVisible();
  await expect(panel.getByText('2 h 15')).toBeVisible();
  await expect(sidebar.getByText('2 h 15')).toBeVisible();
  await expectAccessible(page);

  // Across its projects, a page of its own in the main sidebar: the time against each budget.
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Time', exact: true })
    .click();
  const report = page.frameLocator('iframe[title="Time"]');
  await expect(report.getByRole('heading', { level: 1, name: 'Time' })).toBeVisible();
  const byProject = report.getByRole('table', { name: 'Time by project' });
  await expect(byProject.getByRole('row', { name: new RegExp(key) })).toContainText(
    'Within budget',
  );
  // Drawn, and told to screen readers: 2 h 15 is 0.3 of the 7-hour days set, against 22.5.
  const charted = report
    .getByRole('table', { name: 'Days spent by project, against each budget' })
    .getByRole('row', { name: new RegExp(key) });
  await expect(charted).toContainText('0.3 d');
  await expect(charted).toContainText('22.5 d');
  await report.getByRole('combobox', { name: 'Project' }).selectOption({ label: key });
  await expect(page).toHaveURL(/project=/);
  await expectAccessible(page);

  // Time logged from the report on any issue: in one of the plugin's dialogs, drawn by Toppo,
  // the issue picked in Toppo's search, among those of the project shown.
  await report.getByRole('button', { name: 'Log time' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log time' });
  await expect(dialog.getByText('Asked by Time tracking')).toBeVisible();
  const logging = dialog.frameLocator('iframe[title="Log time"]');
  await logging.getByRole('button', { name: 'Choose an issue' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose an issue' });
  await picker.getByRole('textbox', { name: 'Search' }).fill(issueKey);
  await expectAccessible(page);
  await picker.getByRole('button', { name: new RegExp(issueKey) }).click();
  await expect(picker).toBeHidden();
  await expect(logging.getByText(`${issueKey} · Search is slow`)).toBeVisible();
  await logging.getByRole('spinbutton', { name: 'Hours' }).fill('4');
  await logging.getByRole('spinbutton', { name: 'Minutes' }).fill('45');
  await expectAccessible(page);
  await logging.getByRole('button', { name: 'Log time' }).click();
  await expect(dialog).toBeHidden();
  // 2 h 15 and 4 h 45: one day of 7 hours.
  await expect(charted).toContainText('1 d');
  await expect(byProject.getByRole('row', { name: new RegExp(key) })).toContainText('1 d');

  const outside = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId: elsewhere, minutes: 90, spentOn: '2026-10-28' },
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
  await confirm.getByRole('radio', { name: 'Delete it, for good' }).check();
  await confirm.getByRole('button', { name: 'Uninstall the plugin' }).click();
  await expect(page.getByText('No plugin installed')).toBeVisible();

  // Gone with its permission, and its property with what it wrote.
  await page.goto('/settings/properties');
  await expect(page.getByRole('heading', { level: 1, name: 'Issue properties' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Time spent/ })).toHaveCount(0);
  await page.goto('/settings/roles');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(logTime).toHaveCount(0);
  const gone = await page.request.post(LOG_TIME, {
    headers: { origin },
    data: { issueId, minutes: 90, spentOn: '2026-10-28' },
  });
  expect(gone.status()).toBe(404);
});
