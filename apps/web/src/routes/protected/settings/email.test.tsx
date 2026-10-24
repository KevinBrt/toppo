import type { MailSettings } from '@toppo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, fakeServer, GRACE, renderApp } from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const SAVED: MailSettings = {
  host: 'smtp.example.com',
  port: 587,
  security: 'starttls',
  username: 'toppo@example.com',
  passwordSet: true,
  fromAddress: 'toppo@example.com',
  fromName: 'Toppo',
};

const field = (name: string) => page.getByLabelText(name, { exact: true });
const testButton = () => page.getByRole('button', { name: 'Send a test email' });

describe('the email settings', () => {
  it('set email up, then send a test email to the administrator', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/email' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Email' })).toBeVisible();
    await expect.element(screen.getByText(/^Email is not set up/)).toBeVisible();
    await expect.element(testButton()).toBeDisabled();
    await field('SMTP server').fill('smtp.example.com');
    await field('Security').selectOptions('TLS (usually port 465)');
    await expect.element(field('Port')).toHaveValue('465');
    await field('User name').fill('toppo@example.com');
    await field('Password').fill('mail password');
    await field('Sender address').fill('toppo@example.com');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Email settings saved.')).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/settings/email',
      body: {
        host: 'smtp.example.com',
        port: 465,
        security: 'tls',
        username: 'toppo@example.com',
        password: 'mail password',
        fromAddress: 'toppo@example.com',
        fromName: 'Toppo',
      },
    });
    await testButton().click();
    await expect
      .element(screen.getByText('A test email left for ada@example.com. Check that it arrived.'))
      .toBeVisible();
  });

  it('say why the server refused the test email', async () => {
    fakeServer({ user: ADA, mailSettings: SAVED, mailTestRefusal: 'MAIL_AUTHENTICATION_FAILED' });
    const { screen } = await renderApp({ path: '/settings/email' });

    await testButton().click();

    await expect
      .element(screen.getByText('The server refused the user name or the password.'))
      .toBeVisible();
  });

  it('keep the password saved, and test only what is saved', async () => {
    const fake = fakeServer({ user: ADA, mailSettings: SAVED });
    const { screen } = await renderApp({ path: '/settings/email' });

    await expect.element(screen.getByText('Saved. Leave it empty to keep it.')).toBeVisible();
    await field('Sender name').fill('Help desk');
    await expect.element(testButton()).toBeDisabled();
    await expect.element(screen.getByText('Save your changes before testing them.')).toBeVisible();
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(testButton()).toBeEnabled();
    const saved = fake.requests.findLast(({ method }) => method === 'PUT')?.body;
    expect(saved).toMatchObject({ fromName: 'Help desk' });
    expect(saved).not.toHaveProperty('password');
  });

  it('say what is missing before sending anything', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/email' });

    await field('Sender address').fill('not an address');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(field('SMTP server')).toHaveAttribute('aria-invalid', 'true');
    await expect.element(field('Sender address')).toHaveAttribute('aria-invalid', 'true');
    expect(fake.requests.some(({ method }) => method === 'PUT')).toBe(false);
  });

  it('turn email off after asking, the form then empty', async () => {
    const fake = fakeServer({ user: ADA, mailSettings: SAVED });
    const { screen } = await renderApp({ path: '/settings/email' });

    await screen.getByRole('button', { name: 'Turn off email' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Turn off email?' });
    await dialog.getByRole('button', { name: 'Turn off email' }).click();

    await expect.element(screen.getByText(/^Email is not set up/)).toBeVisible();
    await expect.element(field('SMTP server')).toHaveValue('');
    expect(fake.state.mailSettings).toBeNull();
  });

  it('are kept from those who do not manage the settings', async () => {
    fakeServer({ user: GRACE });
    const { screen } = await renderApp({ path: '/settings/email' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
  });
});
