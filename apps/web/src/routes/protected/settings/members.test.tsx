import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  fakeProject,
  fakeServer,
  GRACE,
  memberOf,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A former client, deactivated. */
const ELOISE = {
  id: '01a1569b-9900-7000-8000-000000000003',
  name: 'Éloïse Turing',
  email: 'eloise@client.example',
  role: ROLE_BADGES.requester,
  deactivatedAt: '2026-10-01T09:00:00.000Z',
};

/** The State column of a member's row, as shown on wide screens. */
function stateOf(name: string) {
  return page.getByRole('row').filter({ hasText: name }).getByRole('cell').nth(2);
}

describe('the members screen', () => {
  it('lists every member with their role and state', async () => {
    const server = fakeServer({ user: ADA });
    server.state.users.push(ELOISE);
    const { screen } = await renderApp({ path: '/settings/members' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Members' })).toBeVisible();
    await expect.element(screen.getByText('3 members', { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Role of Grace Hopper, Team' }))
      .toBeVisible();
    const adaRow = screen.getByRole('row').filter({ hasText: 'Ada Lovelace' });
    await expect.element(adaRow.getByText('(you)')).toBeVisible();
    await expect.element(adaRow.getByText('Administrator')).toBeVisible();
    await expect.element(stateOf('Ada Lovelace')).toHaveTextContent('Active');
    await expect.element(stateOf('Éloïse Turing')).toHaveTextContent('Deactivated');
    await expect.element(screen.getByText('3 members shown')).toBeVisible();
  });

  it('never lets one change one’s own role or deactivate oneself', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });

    await expect
      .element(screen.getByRole('button', { name: /^Role of Grace Hopper/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /^Role of Ada Lovelace/ }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Actions for Ada Lovelace' }))
      .not.toBeInTheDocument();
  });

  it('has the server filter by role, keeping the filter in the address', async () => {
    const server = fakeServer({ user: ADA });
    server.state.users.push(ELOISE);
    const { screen, router } = await renderApp({ path: '/settings/members' });
    const filters = screen.getByRole('group', { name: 'Filter by role' });

    await filters.getByRole('button', { name: 'Team 1' }).click();

    await expect
      .element(filters.getByRole('button', { name: 'Team 1' }))
      .toHaveAttribute('aria-pressed', 'true');
    await expect.element(screen.getByText('1 member shown')).toBeVisible();
    await expect
      .element(screen.getByRole('table').getByText('Ada Lovelace'))
      .not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ role: ROLE_BADGES.team.id });
    expect(server.requests.map((request) => request.path)).toContain(
      `/api/v1/members?role=${ROLE_BADGES.team.id}`,
    );
  });

  it('has the server search once typing pauses', async () => {
    const server = fakeServer({ user: ADA });
    server.state.users.push(ELOISE);
    const { screen, router } = await renderApp({ path: '/settings/members' });
    const searchbox = screen.getByRole('searchbox', { name: 'Name or email' });

    await searchbox.fill('eloise');

    await expect.element(screen.getByText('Éloïse Turing')).toBeVisible();
    await expect.element(screen.getByText('1 member shown')).toBeVisible();
    expect(router.state.location.search).toEqual({ q: 'eloise' });
    const searches = server.requests.filter((request) => request.path.includes('search='));
    expect(searches.map((request) => request.path)).toStrictEqual([
      '/api/v1/members?search=eloise',
    ]);

    await searchbox.fill('nobody');
    await expect.element(screen.getByText('No member matches this search.')).toBeVisible();
  });

  it('opens on the filters an address carries', async () => {
    const server = fakeServer({ user: ADA });
    server.state.users.push(ELOISE);
    const { screen } = await renderApp({ path: '/settings/members?q=grace' });

    await expect
      .element(screen.getByRole('searchbox', { name: 'Name or email' }))
      .toHaveValue('grace');
    await expect.element(screen.getByText('1 member shown')).toBeVisible();
  });

  it('goes through the pages the server cuts', async () => {
    const server = fakeServer({ user: ADA });
    for (let index = 0; index < 60; index += 1) {
      server.state.users.push({
        ...ELOISE,
        id: `01a1569b-9900-7000-8000-${String(index).padStart(12, '0')}`,
        name: `Member ${String(index).padStart(2, '0')}`,
        email: `member${index}@example.com`,
        deactivatedAt: null,
      });
    }
    const { screen, router } = await renderApp({ path: '/settings/members' });
    const pages = screen.getByRole('navigation', { name: 'Pages' });

    await expect.element(pages.getByText('1–50 of 62')).toBeVisible();
    await expect.element(pages.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await pages.getByRole('button', { name: 'Next' }).click();

    await expect.element(pages.getByText('51–62 of 62')).toBeVisible();
    await expect.element(pages.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(router.state.location.search).toEqual({ page: 2 });
  });

  it('changes a role', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });
    await screen.getByRole('button', { name: 'Role of Grace Hopper, Team' }).click();
    await screen.getByRole('menuitemradio', { name: 'Requester' }).click();

    await expect
      .element(screen.getByRole('button', { name: 'Role of Grace Hopper, Requester' }))
      .toBeVisible();
    expect(server.requests).toContainEqual({
      method: 'PATCH',
      path: `/api/v1/users/${GRACE.id}`,
      body: { roleId: DEFAULT_ROLE_IDS.requester },
    });
  });

  it('deletes a member once the deletion is confirmed', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Actions for Grace Hopper' }).click();
    await screen.getByRole('menuitem', { name: 'Delete' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Grace Hopper?' });
    await expect.element(dialog).toHaveAccessibleDescription(/deactivate it instead/);
    await dialog.getByRole('button', { name: 'Delete for good' }).click();

    await expect
      .element(screen.getByRole('table').getByText('Grace Hopper'))
      .not.toBeInTheDocument();
    expect(server.requests).toContainEqual({
      method: 'DELETE',
      path: `/api/v1/users/${GRACE.id}`,
      body: undefined,
    });
  });

  it('keeps the member when the deletion is cancelled, and gives the focus back', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });
    const actions = screen.getByRole('button', { name: 'Actions for Grace Hopper' });

    await actions.click();
    await screen.getByRole('menuitem', { name: 'Delete' }).click();
    await screen.getByRole('button', { name: 'Cancel' }).click();

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(actions).toHaveFocus();
    await expect.element(screen.getByRole('table').getByText('Grace Hopper')).toBeVisible();
    expect(server.requests.some((request) => request.method === 'DELETE')).toBe(false);
  });

  it('deactivates and reactivates a member from the row menu', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });
    await screen.getByRole('button', { name: 'Actions for Grace Hopper' }).click();
    await screen.getByRole('menuitem', { name: 'Deactivate' }).click();

    await expect.element(stateOf('Grace Hopper')).toHaveTextContent('Deactivated');
    await screen.getByRole('button', { name: 'Actions for Grace Hopper' }).click();
    await screen.getByRole('menuitem', { name: 'Reactivate' }).click();

    await expect.element(stateOf('Grace Hopper')).toHaveTextContent('Active');
  });

  it('puts things back and says why when the server refuses', async () => {
    // Grace is the only administrator left: demoting her is what the server refuses.
    fakeServer({
      user: ADA,
      users: [memberOf(ADA, ROLE_BADGES.team), memberOf(GRACE, ROLE_BADGES.administrator)],
    });
    const { screen } = await renderApp({ path: '/settings/members' });
    await screen.getByRole('button', { name: 'Role of Grace Hopper, Administrator' }).click();
    await screen.getByRole('menuitemradio', { name: 'Team' }).click();

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('Toppo must keep at least one active administrator.');
    await expect
      .element(screen.getByRole('button', { name: 'Role of Grace Hopper, Administrator' }))
      .toBeVisible();
  });

  it('is closed to users who cannot manage members, without asking the server', async () => {
    const server = fakeServer({ user: GRACE });
    const { screen } = await renderApp({ path: '/settings/members' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
    expect(server.requests.some((request) => request.path.startsWith('/api/v1/members'))).toBe(
      false,
    );
  });

  it('fits a 320 px phone without scrolling sideways', async () => {
    await page.viewport(320, 640);
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/members' });
    await expect
      .element(screen.getByRole('button', { name: 'Actions for Grace Hopper' }))
      .toBeVisible();

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320);
  });
});

describe('the projects of a member', () => {
  it('are switched on one by one, or all at once', async () => {
    const server = fakeServer({
      user: ADA,
      projects: [
        fakeProject('WEB', 'Website'),
        fakeProject('API', 'Public API', { members: [{ userId: ADA.id, roleId: null }] }),
      ],
    });
    const { screen } = await renderApp({ path: '/settings/members' });

    await screen.getByRole('button', { name: 'Actions for Grace Hopper' }).click();
    await screen.getByRole('menuitem', { name: 'Project access' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Project access of Grace Hopper' });

    await expect.element(dialog.getByRole('switch', { name: 'Access to Website' })).toBeChecked();
    await dialog.getByRole('switch', { name: 'Access to Public API' }).click();
    await expect
      .element(dialog.getByRole('switch', { name: 'Access to Public API' }))
      .toBeChecked();
    expect(server.state.projects[1]?.members).toContainEqual({ userId: GRACE.id, roleId: null });

    await dialog.getByRole('switch', { name: 'Every project' }).click();

    await expect.element(dialog.getByRole('switch', { name: 'Every project' })).toBeChecked();
    await expect.element(dialog.getByRole('switch', { name: 'Access to Website' })).toBeDisabled();
    expect(server.state.allProjects.has(GRACE.id)).toBe(true);
  });
});
