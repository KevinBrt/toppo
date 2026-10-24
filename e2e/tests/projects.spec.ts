import { randomInt } from 'node:crypto';
import { ADMIN } from './admin.ts';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

/** A key no other test has taken: desktop and phone run side by side on one database. */
function uniqueKey(): string {
  return `P${randomInt(36 ** 5)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')}`;
}

test('a project is created, set up, archived, brought back and deleted', async ({ page }) => {
  const key = uniqueKey();
  // Never first by name: `/issues` opens the first project, which other tests keep, while this
  // one is deleted under them.
  const name = `Portal ${key}`;
  const renamed = `Partner portal ${key}`;

  await page.goto('/projects');
  await page.getByRole('button', { name: 'New project' }).click();
  const dialog = page.getByRole('dialog', { name: 'New project' });
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByLabel('Key').fill(key);
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Create the project' }).click();

  // The new project opens on its general settings.
  await expect(page.getByRole('heading', { level: 1, name: 'General' })).toBeVisible();
  await expect(page).toHaveURL(`/projects/${key}`);
  await page.getByLabel('Project name').fill(renamed);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await expectAccessible(page);

  // Its access: the administrator reaches it whatever its members.
  await page
    .getByRole('navigation', { name: 'Project sections' })
    .getByRole('link', { name: 'Access' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Project access' })).toBeVisible();
  await expect(
    page.getByRole('listitem').filter({ hasText: ADMIN.name }).getByText('Automatic access'),
  ).toBeVisible();
  await expectAccessible(page);

  // Archived: read-only, out of the active projects, and back after.
  await page.goto(`/projects/${key}`);
  await page.getByRole('button', { name: 'Archive', exact: true }).click();
  await page
    .getByRole('dialog', { name: `Archive ${renamed}?` })
    .getByRole('button', { name: 'Archive the project' })
    .click();
  await expect(page.getByText('This project is archived: it is read-only.')).toBeVisible();
  await expect(page.getByLabel('Project name')).toHaveCount(0);

  await page.goto(`/projects?q=${key}`);
  await expect(page.getByText('No project matches this search.')).toBeVisible();
  await page.getByRole('button', { name: /^Archived/ }).click();
  await page.getByRole('link', { name: renamed }).click();
  await page.getByRole('button', { name: 'Unarchive' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue(renamed);

  // Deleted for good, once its key is typed.
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  const deletion = page.getByRole('dialog', { name: `Delete ${renamed}?` });
  await deletion.getByLabel(`Type ${key} to confirm`).fill(key);
  await expectAccessible(page);
  await deletion.getByRole('button', { name: 'Delete for good' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto(`/projects?q=${key}`);
  await expect(page.getByText('No project matches this search.')).toBeVisible();
});

test.describe('out of reach', () => {
  // The browser reports the 404 answer in the console; it is expected here.
  test.use({ allowedConsoleErrors: [/status of 404/] });

  test('a project answers as if it did not exist', async ({ page }) => {
    await page.goto('/projects/NOPE404');

    await expect(
      page.getByText('This project does not exist, or you do not have access to it.'),
    ).toBeVisible();
    await expectAccessible(page);
  });
});
