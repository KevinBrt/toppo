import { ADMIN } from './admin.ts';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

test.describe('signed out', () => {
  // A fresh browser, not the administrator's saved session.
  test.use({ storageState: { cookies: [], origins: [] } });

  test('the wizard is closed once the instance is set up', async ({ page }) => {
    await page.goto('/setup');

    await expect(page).toHaveURL(/\/login$/);
  });

  test('protected pages lead to the sign-in page, which is accessible', async ({ page }) => {
    await page.goto('/projects');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fprojects$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in to Toppo' })).toBeVisible();
    await expectAccessible(page);
  });

  // biome-ignore lint/correctness/usePlaywrightValidDescribeCallback: Playwright takes the details (tags) before the callback.
  test.describe('with the server rejecting a password', { tag: '@desktop-only' }, () => {
    // The browser reports the 401 answer in the console; it is expected here.
    test.use({ allowedConsoleErrors: [/status of 401/] });

    test('a wrong password is reported', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(ADMIN.email);
      await page.getByLabel('Password', { exact: true }).fill('not the right password');
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByRole('alert')).toHaveText('Incorrect email or password.');
    });
  });

  test('signing in opens the requested page, signing out ends the session', {
    tag: '@desktop-only',
  }, async ({ page }) => {
    await page.goto('/settings/members');
    await page.getByLabel('Email').fill(ADMIN.email);
    await page.getByLabel('Password', { exact: true }).fill(ADMIN.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/settings\/members$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/issues');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fissues$/);
  });
});
