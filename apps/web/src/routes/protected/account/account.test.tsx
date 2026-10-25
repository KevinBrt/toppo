import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import { ADA, ADA_PASSWORD, fakeServer, renderApp } from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NEW_PASSWORD = 'a brand new passphrase for ada';

describe('my account', () => {
  it('opens from the account in the sidebar', async () => {
    fakeServer({ user: ADA });
    const { screen, router } = await renderApp();

    await screen.getByRole('link', { name: /^My account/ }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'My account' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/account');
    await expect.element(screen.getByLabelText('Email')).toHaveValue(ADA.email);
    await expect.element(screen.getByLabelText('Email')).toHaveAttribute('readonly');
  });

  it('renames the user, at once in the sidebar too', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByLabelText('Name').fill('  Augusta Ada King ');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Your name is saved.')).toBeVisible();
    expect(server.requests.find(({ method }) => method === 'PATCH')?.body).toEqual({
      name: 'Augusta Ada King',
    });
    await expect
      .element(screen.getByRole('link', { name: /^My account Augusta Ada King/ }))
      .toBeVisible();
  });

  it('refuses an empty name without asking the server', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByLabelText('Name').fill('   ');
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('This field is required.')).toBeVisible();
    expect(server.requests.some(({ method }) => method === 'PATCH')).toBe(false);
  });

  it('changes the password, then empties the form', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByLabelText('Current password').fill(ADA_PASSWORD);
    await screen.getByLabelText('New password').fill(NEW_PASSWORD);
    await screen.getByRole('button', { name: 'Change password' }).click();

    await expect
      .element(screen.getByText('Your password is changed. Your other devices are signed out.'))
      .toBeVisible();
    expect(server.requests.find(({ path }) => path === '/api/auth/change-password')?.body).toEqual({
      currentPassword: ADA_PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    await expect.element(screen.getByLabelText('Current password')).toHaveValue('');
    await expect.element(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('says so under the field when the current password is wrong', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByLabelText('Current password').fill('not my password at all');
    await screen.getByLabelText('New password').fill(NEW_PASSWORD);
    await screen.getByRole('button', { name: 'Change password' }).click();

    await expect
      .element(screen.getByLabelText('Current password'))
      .toHaveAccessibleDescription('This is not your current password.');
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  it('asks for a long enough new password', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByLabelText('Current password').fill(ADA_PASSWORD);
    await screen.getByLabelText('New password').fill('too short');
    await screen.getByRole('button', { name: 'Change password' }).click();

    await expect
      .element(screen.getByLabelText('New password'))
      .toHaveAccessibleDescription(
        'At least 12 characters. A long passphrase is the safest choice. Use at least 12 characters.',
      );
    expect(server.requests.some(({ path }) => path === '/api/auth/change-password')).toBe(false);
  });

  it('closes the phone drawer when the account is opened from it', async () => {
    await page.viewport(375, 812);
    fakeServer({ user: ADA });
    const { screen } = await renderApp();

    await screen.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = screen.getByRole('dialog', { name: 'Main navigation' });
    await drawer.getByRole('link', { name: /^My account/ }).click();

    await expect.element(drawer).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'My account' }))
      .toBeVisible();
  });
});

describe('the language', () => {
  it('is chosen on the account: the whole interface speaks it at once, and the server keeps it', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/account' });

    await screen.getByRole('combobox', { name: 'Language' }).selectOptions('fr');

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Mon compte' }))
      .toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Tickets' })).toBeVisible();
    expect(document.documentElement.lang).toBe('fr');
    expect(fake.state.user?.locale).toBe('fr');
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/me/locale',
      body: { locale: 'fr' },
    });
  });

  it('is the account’s, whatever the browser speaks, and the browser’s never replaces it', async () => {
    const fake = fakeServer({ user: { ...ADA, locale: 'fr' } });
    const { screen } = await renderApp({ path: '/account', locale: 'en' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Mon compte' }))
      .toBeVisible();
    await expect.element(screen.getByRole('combobox', { name: 'Langue' })).toHaveValue('fr');
    expect(fake.requests.some(({ path }) => path === '/api/v1/me/locale')).toBe(false);
  });
});

describe('notification emails', () => {
  const kind = (name: string) => page.getByRole('switch', { name });

  it('are chosen kind by kind, every kind on by default, each saved at once', async () => {
    const fake = fakeServer({ user: ADA, mailSettings: null });
    const { screen } = await renderApp({ path: '/account' });

    for (const name of [
      'New issues',
      'Issues given to me',
      'Assignments of the issues I follow',
      'Comments on the issues I follow',
      'Mentions',
      'Status changes of the issues I follow',
      'Duplicates among the issues I follow',
    ]) {
      await expect.element(kind(name)).toBeChecked();
    }
    await expect
      .element(
        screen.getByText('Email is not set up on this instance yet: nothing is sent for now.'),
      )
      .toBeVisible();
    await kind('Status changes of the issues I follow').click();

    await expect.element(kind('Status changes of the issues I follow')).not.toBeChecked();
    await expect.element(kind('Mentions')).toBeChecked();
    expect(fake.state.user?.emailedEvents).toStrictEqual([
      'created',
      'assigned',
      'assigneeChanged',
      'commented',
      'mentioned',
      'duplicateChanged',
    ]);
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/me/email-notifications',
      body: {
        emailed: [
          'created',
          'assigned',
          'assigneeChanged',
          'commented',
          'mentioned',
          'duplicateChanged',
        ],
      },
    });
  });

  it('say nothing of email once it is set up', async () => {
    fakeServer({
      user: { ...ADA, emailedEvents: ['mentioned'] },
      mailSettings: {
        host: 'smtp.example.com',
        port: 587,
        security: 'starttls',
        username: null,
        passwordSet: false,
        fromAddress: 'toppo@example.com',
        fromName: 'Toppo',
      },
    });
    const { screen } = await renderApp({ path: '/account' });

    await expect.element(kind('Mentions')).toBeChecked();
    await expect.element(kind('New issues')).not.toBeChecked();
    await expect.element(screen.getByText(/^Email is not set up/)).not.toBeInTheDocument();
  });
});
