import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeServer, invitationToken, renderApp } from '../../test-helpers.tsx';

afterEach(() => {
  vi.restoreAllMocks();
});

const PASSWORD = 'correct horse battery staple';

function withLink(status: 'pending' | 'expired' | 'used') {
  const server = fakeServer();
  const token = invitationToken(1);
  server.state.invitationLinks.set(token, {
    email: 'nina@example.com',
    invitedBy: 'Ada Lovelace',
    status,
  });
  return { server, token };
}

describe('accepting an invitation', () => {
  it('says whom the link is for, creates the account in the browser’s language, then opens the sign-in page', async () => {
    const { server, token } = withLink('pending');
    const { screen, router } = await renderApp({ path: `/invitation#${token}` });

    await expect
      .element(
        screen.getByText('Ada Lovelace invited you to Toppo with the address nina@example.com.'),
      )
      .toBeVisible();
    await screen.getByLabelText('Your name').fill('Nina Petit');
    await screen.getByLabelText('Password', { exact: true }).fill(PASSWORD);
    await screen.getByRole('button', { name: 'Create my account' }).click();

    await expect
      .element(screen.getByText('Your account is ready. Sign in to continue.'))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/login');
    await expect.element(screen.getByLabelText('Email')).toHaveValue('nina@example.com');
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/invitations/accept',
      body: { token, name: 'Nina Petit', password: PASSWORD, locale: 'en' },
    });
  });

  it('needs no name when who sent the invitation was deleted', async () => {
    const server = fakeServer();
    const token = invitationToken(1);
    server.state.invitationLinks.set(token, {
      email: 'nina@example.com',
      invitedBy: null,
      status: 'pending',
    });
    const { screen } = await renderApp({ path: `/invitation#${token}` });

    await expect
      .element(screen.getByText('You are invited to Toppo with the address nina@example.com.'))
      .toBeVisible();
  });

  it('never puts the token in a request URL', async () => {
    const { server, token } = withLink('pending');
    const { screen } = await renderApp({ path: `/invitation#${token}` });
    await expect.element(screen.getByLabelText('Your name')).toBeVisible();

    expect(server.requests.some((request) => request.path.includes(token))).toBe(false);
  });

  it('checks the name and password before sending them', async () => {
    const { server, token } = withLink('pending');
    const { screen } = await renderApp({ path: `/invitation#${token}` });

    await screen.getByLabelText('Password', { exact: true }).fill('short');
    await screen.getByRole('button', { name: 'Create my account' }).click();

    await expect.element(screen.getByText('This field is required.')).toBeVisible();
    await expect.element(screen.getByText('Use at least 12 characters.')).toBeVisible();
    expect(server.requests.map((request) => request.path)).not.toContain(
      '/api/v1/invitations/accept',
    );
  });

  it.each([
    ['expired', 'This invitation link has expired. Ask the person who invited you for a new one.'],
    ['used', 'This invitation link is not valid. Ask the person who invited you for a new one.'],
  ] as const)('explains a link that is %s', async (status, message) => {
    const { token } = withLink(status);
    const { screen } = await renderApp({ path: `/invitation#${token}` });

    await expect.element(screen.getByRole('alert')).toHaveTextContent(message);
    await expect.element(screen.getByLabelText('Your name')).not.toBeInTheDocument();
  });

  it('refuses a malformed link without asking the server', async () => {
    const server = fakeServer();
    const { screen } = await renderApp({ path: '/invitation#not-a-token' });

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent(
        'This invitation link is not valid. Ask the person who invited you for a new one.',
      );
    expect(server.requests.map((request) => request.path)).not.toContain(
      '/api/v1/invitations/preview',
    );
  });
});
