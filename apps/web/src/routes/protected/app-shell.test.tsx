import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, fakeServer, renderApp } from '../../test-helpers.tsx';

beforeEach(() => {
  fakeServer({ user: ADA });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await page.viewport(1280, 800);
});

describe('AppShell on desktop', () => {
  it('redirects / to the issues page', async () => {
    const { screen } = await renderApp({ path: '/' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Issues' })).toBeVisible();
  });

  it('shows the sidebar and marks the current page', async () => {
    const { screen } = await renderApp({ path: '/projects' });
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });

    await expect.element(nav).toBeVisible();
    await expect
      .element(nav.getByRole('link', { name: 'Projects' }))
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(nav.getByRole('link', { name: 'Issues' }))
      .not.toHaveAttribute('aria-current');
    await expect
      .element(screen.getByRole('button', { name: 'Open navigation', includeHidden: true }))
      .not.toBeVisible();
  });

  it('shows who is signed in', async () => {
    const { screen } = await renderApp();

    await expect.element(screen.getByText('Ada Lovelace')).toBeVisible();
    await expect.element(screen.getByText('ada@example.com')).toBeVisible();
  });

  it('navigates and updates the heading and the tab title', async () => {
    const { screen } = await renderApp();

    await screen
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Projects' })
      .click();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    expect(document.title).toBe('Projects · Toppo');
  });

  it('offers a skip link to the main content', async () => {
    const { screen } = await renderApp();

    await expect
      .element(screen.getByRole('link', { name: 'Skip to content' }))
      .toHaveAttribute('href', '#main');
  });

  it('shows a not-found page inside the shell', async () => {
    const { screen } = await renderApp({ path: '/does-not-exist' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Page not found' }))
      .toBeVisible();
    await expect.element(screen.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  });

  it('speaks French when the account does', async () => {
    fakeServer({ user: { ...ADA, locale: 'fr' } });
    const { screen } = await renderApp();

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Tickets' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
  });
});

describe('AppShell on a phone', () => {
  it('hides the sidebar behind a menu button', async () => {
    await page.viewport(375, 812);
    const { screen } = await renderApp();

    await expect
      .element(screen.getByRole('navigation', { name: 'Main navigation', includeHidden: true }))
      .not.toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Open navigation' })).toBeVisible();
  });

  it('opens the navigation drawer and closes it after navigating', async () => {
    await page.viewport(375, 812);
    const { screen } = await renderApp();

    await screen.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = screen.getByRole('dialog', { name: 'Main navigation' });
    await expect.element(drawer).toBeVisible();

    await drawer.getByRole('link', { name: 'My issues' }).click();

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'My issues' }))
      .toBeVisible();
  });

  it('never scrolls horizontally', async () => {
    await page.viewport(320, 640);
    const { screen } = await renderApp();
    await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible();

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});
