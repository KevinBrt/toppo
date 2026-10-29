import AxeBuilder from '@axe-core/playwright';
import { test as base, expect, type Page } from '@playwright/test';

interface Fixtures {
  /** Console errors a test expects, e.g. the browser logging a 401 answer. */
  allowedConsoleErrors: RegExp[];
  /** Fails the test on any other console error or uncaught exception, CSP violations included. */
  failOnConsoleErrors: undefined;
}

export const test = base.extend<Fixtures>({
  allowedConsoleErrors: [[], { option: true }],
  failOnConsoleErrors: [
    async ({ page, allowedConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        if (
          message.type() === 'error' &&
          !allowedConsoleErrors.some((allowed) => allowed.test(text))
        ) {
          errors.push(text);
        }
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await use(undefined);
      expect(errors, 'console errors').toStrictEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Runs axe against WCAG 2.2 AA and fails on any violation. */
export async function expectAccessible(page: Page): Promise<void> {
  // Animations end first: a dialog fading in would be judged on its colors halfway through.
  await page.evaluate(async () => {
    const ending = document
      .getAnimations()
      .filter(
        (animation) => animation.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY,
      );
    // One cancelled meanwhile (a hover undone as a dialog opens) has ended too.
    await Promise.all(ending.map((animation) => animation.finished.catch(() => animation)));
  });
  const results = await new AxeBuilder({ page })
    // Axe would fetch the stylesheets it cannot read through the page, as a plugin's frame (of
    // no origin) holds Toppo's: the frame refuses any request (`connect-src 'none'`), as it must.
    // Set first: it replaces the options, which the tags below add to.
    .options({ preload: false })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toStrictEqual([]);
}

/** Opens the navigation: directly on desktop, through the drawer on phones. */
export async function openNavigation(page: Page, isMobile: boolean) {
  if (isMobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    return page.getByRole('dialog', { name: 'Main navigation' });
  }
  return page.getByRole('navigation', { name: 'Main navigation' });
}
