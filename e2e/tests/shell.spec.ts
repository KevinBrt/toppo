import { expect, openNavigation, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

test('the home page redirects to the issues list', async ({ page }) => {
  await page.goto('/');

  // On the first project the person reaches, if any.
  await expect(page).toHaveURL(/\/issues(\?project=\w+)?$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible();
  await expect(page).toHaveTitle('Issues · Toppo');
});

test('navigates between sections', async ({ page, isMobile }) => {
  await page.goto('/issues');

  const navigation = await openNavigation(page, isMobile);
  await navigation.getByRole('link', { name: 'Projects' }).click();

  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('deep links survive a reload', async ({ page }) => {
  await page.goto('/settings/members');
  await page.reload();

  await expect(page.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
});

test('unknown pages show a not-found page inside the app', async ({ page }) => {
  await page.goto('/nothing/here');

  await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to issues' }).click();
  await expect(page).toHaveURL(/\/issues(\?project=\w+)?$/);
});

// Signed in, Toppo speaks the language of the account (component tests); before, the browser's.
test.describe('in a French browser, signed out', () => {
  test.use({ locale: 'fr-FR', storageState: { cookies: [], origins: [] } });

  test('the sign-in page speaks French', async ({ page }) => {
    await page.goto('/issues');

    await expect(page.getByRole('heading', { level: 1, name: 'Connexion à Toppo' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
