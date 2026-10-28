import type { MailSettings } from '@toppo-tracker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { fakeServer, renderApp } from '../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const MAIL: MailSettings = {
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  username: null,
  passwordSet: false,
  fromAddress: 'toppo@example.com',
  fromName: 'Toppo',
};

const TOKEN = 'aValidResetToken24Chars0';
const NEW_PASSWORD = 'a brand new passphrase for ada';

describe('a forgotten password', () => {
  it('is offered on the sign-in page only once email is set up', async () => {
    fakeServer();
    const { screen } = await renderApp({ path: '/login' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Sign in to Toppo' }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('link', { name: 'Forgot your password?' }))
      .not.toBeInTheDocument();
  });

  it('is reset by email: a link is asked for, whatever the address', async () => {
    const fake = fakeServer({ mailSettings: MAIL });
    const { screen, router } = await renderApp({ path: '/login' });

    await screen.getByRole('link', { name: 'Forgot your password?' }).click();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Forgot your password' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/forgot-password');
    await screen.getByLabelText('Email').fill('Ada@Example.com');
    await screen.getByRole('button', { name: 'Send the link' }).click();

    await expect
      .element(screen.getByText(/^If an account uses ada@example\.com, a link/))
      .toBeVisible();
    await expect.element(screen.getByText(/It works for 60 minutes\.$/)).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'POST',
      path: '/api/auth/request-password-reset',
      body: { email: 'ada@example.com' },
    });
  });

  it('is replaced from the link emailed, then the sign-in page says so', async () => {
    const fake = fakeServer({ resetTokens: [TOKEN] });
    const { screen, router } = await renderApp({ path: `/reset-password#${TOKEN}` });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Choose a new password' }))
      .toBeVisible();
    await screen.getByLabelText('New password').fill(NEW_PASSWORD);
    await screen.getByRole('button', { name: 'Change the password' }).click();

    await expect
      .element(screen.getByText('Your password has changed. Sign in with the new one.'))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    expect(fake.requests).toContainEqual({
      method: 'POST',
      path: '/api/auth/reset-password',
      body: { token: TOKEN, newPassword: NEW_PASSWORD },
    });
  });

  it('asks for a long enough password before trying the link', async () => {
    const fake = fakeServer({ resetTokens: [TOKEN] });
    const { screen } = await renderApp({ path: `/reset-password#${TOKEN}` });

    await screen.getByLabelText('New password').fill('short');
    await screen.getByRole('button', { name: 'Change the password' }).click();

    await expect.element(screen.getByText('Use at least 12 characters.')).toBeVisible();
    expect(fake.requests.some(({ path }) => path === '/api/auth/reset-password')).toBe(false);
  });

  it('says when the link no longer works, or is missing', async () => {
    fakeServer({ resetTokens: [] });
    const { screen } = await renderApp({ path: `/reset-password#${TOKEN}` });

    await screen.getByLabelText('New password').fill(NEW_PASSWORD);
    await screen.getByRole('button', { name: 'Change the password' }).click();

    await expect
      .element(screen.getByText('This link has expired or was already used. Ask for a new one.'))
      .toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Ask for a new link' })).toBeVisible();
  });

  it('shows no form without a link', async () => {
    fakeServer();
    const { screen } = await renderApp({ path: '/reset-password' });

    await expect
      .element(screen.getByText('This link has expired or was already used. Ask for a new one.'))
      .toBeVisible();
    await expect.element(screen.getByLabelText('New password')).not.toBeInTheDocument();
  });
});
