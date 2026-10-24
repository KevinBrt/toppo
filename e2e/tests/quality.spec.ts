import { expect, expectAccessible, openNavigation, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

const PAGES = [
  '/issues',
  '/my-issues',
  '/projects',
  '/settings',
  '/settings/members',
  '/settings/roles',
  '/settings/email',
  '/account',
  '/forgot-password',
  '/reset-password',
  '/nothing/here',
];

for (const path of PAGES) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expectAccessible(page);
  });
}

test('the navigation drawer is accessible', { tag: '@mobile-only' }, async ({ page }) => {
  await page.goto('/issues');

  await openNavigation(page, true);

  await expectAccessible(page);
});

test('the layout never scrolls horizontally', async ({ page }) => {
  // A plain page, a list with tabs, one with its own section navigation, a wide table, a form.
  for (const path of [
    '/issues',
    '/projects',
    '/settings/members',
    '/settings/roles',
    '/settings/email',
  ]) {
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow of ${path} at ${width}px`).toBe(0);
    }
  }
});

test('navigation targets are large enough for touch', { tag: '@mobile-only' }, async ({ page }) => {
  await page.goto('/issues');

  const navigation = await openNavigation(page, true);
  for (const link of await navigation.getByRole('link').all()) {
    const box = await link.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
});

test('the skip link moves focus to the main content', { tag: '@desktop-only' }, async ({
  page,
}) => {
  await page.goto('/issues');
  // The page renders once the session is known; tab only then, like a person would.
  await expect(page.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible();

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');

  await expect(page.locator('main')).toBeFocused();
});
