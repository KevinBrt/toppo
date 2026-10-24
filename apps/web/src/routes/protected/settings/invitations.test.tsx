import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  fakeProject,
  fakeServer,
  invitationToken,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

/** The first link the fake server makes. */
const FIRST_LINK = `http://localhost:3000/invitation#${invitationToken(1)}`;

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const PENDING = {
  id: '01a1569b-9900-7000-8000-000000000301',
  email: 'nina@example.com',
  role: ROLE_BADGES.team,
  invitedBy: 'Ada Lovelace',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

const EXPIRED = {
  ...PENDING,
  id: '01a1569b-9900-7000-8000-000000000302',
  email: 'late@example.com',
  expiresAt: '2020-01-01T00:00:00.000Z',
};

/** The State column of a row, as shown on wide screens. */
function stateOf(text: string) {
  return page.getByRole('row').filter({ hasText: text }).getByRole('cell').nth(2);
}

describe('invitations on the members screen', () => {
  it('say so when who sent them was deleted', async () => {
    fakeServer({ user: ADA, invitations: [{ ...PENDING, invitedBy: null }] });
    const { screen } = await renderApp({ path: '/settings/members' });

    await expect.element(screen.getByText('Invited by a deleted user')).toBeVisible();
  });

  it('show among the members, with their role and state, and in the head count', async () => {
    fakeServer({ user: ADA, invitations: [PENDING, EXPIRED] });
    const { screen } = await renderApp({ path: '/settings/members' });

    await expect
      .element(screen.getByText('4 members, including 2 pending invitations'))
      .toBeVisible();
    const nina = screen.getByRole('row').filter({ hasText: 'nina@example.com' });
    await expect.element(nina.getByText('Invited by Ada Lovelace')).toBeVisible();
    await expect.element(nina.getByText('Team')).toBeVisible();
    await expect.element(stateOf('nina@example.com')).toHaveTextContent('Invited');
    await expect.element(stateOf('late@example.com')).toHaveTextContent('Expired');
  });

  it('are created from addresses and a role, with links shown once', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Invite members' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Invite members' });
    await dialog.getByLabelText('Email addresses').fill('nina@example.com, grace@example.com oops');
    await dialog.getByLabelText('Role').selectOptions('Team');
    await dialog.getByRole('button', { name: 'Create the links' }).click();
    await expect.element(dialog.getByText('Not valid: oops')).toBeVisible();

    await dialog.getByLabelText('Email addresses').fill('nina@example.com, grace@example.com');
    await dialog.getByRole('button', { name: 'Create the links' }).click();

    const links = screen.getByRole('dialog', { name: 'Invitation links' });
    const link = links.getByRole('textbox', { name: 'Link for nina@example.com' });
    await expect.element(link).toHaveValue(FIRST_LINK);
    await expect
      .element(links.getByText('Already members, left out: grace@example.com'))
      .toBeVisible();
    await links.getByRole('button', { name: /Copy/ }).click();
    await expect.element(links.getByRole('button', { name: /Copied/ })).toBeVisible();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(FIRST_LINK);
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/invitations',
      // No project by default.
      body: {
        emails: ['nina@example.com', 'grace@example.com'],
        roleId: ROLE_BADGES.team.id,
        allProjects: false,
        projectKeys: [],
      },
    });

    await links.getByRole('button', { name: 'Done' }).click();
    await expect.element(stateOf('nina@example.com')).toHaveTextContent('Invited');
  });

  it('need a role chosen on purpose: none is preselected', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Invite members' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Invite members' });
    await dialog.getByLabelText('Email addresses').fill('nina@example.com');
    await dialog.getByRole('button', { name: 'Create the links' }).click();

    await expect.element(dialog.getByText('This field is required.')).toBeVisible();
    expect(server.requests.filter((request) => request.method === 'POST')).toHaveLength(0);
  });

  it('get a new link from the row menu', async () => {
    fakeServer({ user: ADA, invitations: [PENDING] });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Actions for nina@example.com' }).click();
    await screen.getByRole('menuitem', { name: 'New link' }).click();

    const links = screen.getByRole('dialog', { name: 'Invitation links' });
    await expect
      .element(links.getByRole('textbox', { name: 'Link for nina@example.com' }))
      .toHaveValue(FIRST_LINK);
  });

  it('are deleted from the row menu', async () => {
    fakeServer({ user: ADA, invitations: [PENDING] });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Actions for nina@example.com' }).click();
    await screen.getByRole('menuitem', { name: 'Delete the invitation' }).click();

    await expect
      .element(screen.getByRole('table').getByText('nina@example.com'))
      .not.toBeInTheDocument();
  });

  it('open the projects chosen for them', async () => {
    const server = fakeServer({
      user: ADA,
      projects: [fakeProject('WEB', 'Website'), fakeProject('API', 'Public API')],
    });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Invite members' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Invite members' });
    await dialog.getByLabelText('Email addresses').fill('nina@example.com');
    await dialog.getByLabelText('Role').selectOptions('Team');
    await dialog.getByRole('radio', { name: 'Chosen projects' }).click();
    await dialog.getByRole('button', { name: 'Create the links' }).click();
    await expect.element(dialog.getByText('This field is required.')).toBeVisible();

    await dialog.getByRole('checkbox', { name: /Website/ }).click();
    await expect.element(dialog.getByRole('button', { name: 'Remove Website' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Create the links' }).click();

    await expect.element(screen.getByRole('dialog', { name: 'Invitation links' })).toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/invitations',
      body: {
        emails: ['nina@example.com'],
        roleId: ROLE_BADGES.team.id,
        allProjects: false,
        projectKeys: ['WEB'],
      },
    });
  });
});

describe('invitations with email set up', () => {
  it('say that each link left by email, and still show it', async () => {
    fakeServer({
      user: ADA,
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
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Invite members' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Invite members' });
    await dialog.getByLabelText('Email addresses').fill('nina@example.com');
    await dialog.getByLabelText('Role').selectOptions('Team');
    await dialog.getByRole('button', { name: 'Create the links' }).click();

    const links = screen.getByRole('dialog', { name: 'Invitation links' });
    await expect
      .element(links.getByText(/^Each person received their link by email/))
      .toBeVisible();
    await expect.element(links.getByLabelText('Link for nina@example.com')).toHaveValue(FIRST_LINK);
  });
});
