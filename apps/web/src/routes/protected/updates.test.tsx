import { TOPPO_VERSION } from '@toppo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, fakeServer, GRACE, renderApp } from '../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const NEWER = { version: '99.0.0', url: 'https://github.com/KevinBrt/toppo/releases/tag/v99.0.0' };
const notice = () => page.getByRole('region', { name: 'Update' });

describe('the version of Toppo', () => {
  it('shows at the bottom of the sidebar for everyone', async () => {
    fakeServer({ user: GRACE, latestRelease: NEWER });
    const { screen } = await renderApp({ path: '/issues' });

    await expect.element(screen.getByText(`Toppo ${TOPPO_VERSION}`)).toBeVisible();
    await expect.element(notice()).not.toBeInTheDocument();
  });

  it('tells whoever manages the instance of a newer one, with what is new and how to upgrade', async () => {
    fakeServer({ user: ADA, latestRelease: NEWER });
    await renderApp({ path: '/issues' });

    await expect.element(notice().getByText('Toppo 99.0.0 is available')).toBeVisible();
    await expect
      .element(notice().getByRole('link', { name: 'What’s new' }))
      .toHaveAttribute('href', NEWER.url);
    await expect
      .element(notice().getByRole('link', { name: 'How to upgrade' }))
      .toHaveAttribute('href', expect.stringContaining('self-hosting.md#upgrades'));
  });

  it('says nothing while the version running is the latest', async () => {
    fakeServer({ user: ADA, latestRelease: null });
    const { screen } = await renderApp({ path: '/issues' });

    await expect.element(screen.getByText(`Toppo ${TOPPO_VERSION}`)).toBeVisible();
    await expect.element(notice()).not.toBeInTheDocument();
  });
});
