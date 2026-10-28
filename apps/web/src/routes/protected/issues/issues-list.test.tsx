import { DEFAULT_PRIORITIES, DEFAULT_STATUSES } from '@toppo-tracker/core';
import { type CurrentUser, NOTIFICATION_EVENTS } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { rememberProject } from '../../../features/issues/utils/last-project.util.ts';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeProject,
  fakeServer,
  GRACE,
  memberOf,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
  rememberProject(null);
});

afterEach(() => {
  rememberProject(null);
});

/** A customer: sees and reports their own issues only. */
const RITA: CurrentUser = {
  id: '01a1569b-9900-7000-8000-000000000009',
  name: 'Rita Client',
  email: 'rita@example.com',
  locale: 'en',
  emailedEvents: [...NOTIFICATION_EVENTS],
  permissions: [],
  managesProjects: false,
};

const NEW = defaultField(DEFAULT_STATUSES, 'new');
const IN_PROGRESS = defaultField(DEFAULT_STATUSES, 'inProgress');
const RESOLVED = defaultField(DEFAULT_STATUSES, 'resolved');
const URGENT = defaultField(DEFAULT_PRIORITIES, 'urgent');
const LOW = defaultField(DEFAULT_PRIORITIES, 'low');

/**
 * WEB, with Ada, Grace and Rita in it:
 * - WEB-1 "Broken link", new, normal, unassigned;
 * - WEB-2 "Export is empty", in progress, urgent, Grace's;
 * - WEB-3 "Invoice missing", new, low, Ada's, reported by Rita;
 * - WEB-4 "Old crash", resolved: closed.
 */
function server(user: CurrentUser = ADA) {
  const fake = fakeServer({
    user,
    projects: [
      fakeProject('WEB', 'Website', {
        members: [
          { userId: ADA.id, roleId: null },
          { userId: GRACE.id, roleId: null },
          { userId: RITA.id, roleId: null },
        ],
      }),
    ],
    issues: [
      fakeIssue('WEB', 1, 'Broken link', { description: 'The about page answers 404.' }),
      fakeIssue('WEB', 2, 'Export is empty', {
        statusId: IN_PROGRESS.id,
        priorityId: URGENT.id,
        assigneeId: GRACE.id,
      }),
      fakeIssue('WEB', 3, 'Invoice missing', {
        priorityId: LOW.id,
        assigneeId: ADA.id,
        reporterId: RITA.id,
      }),
      fakeIssue('WEB', 4, 'Old crash', {
        statusId: RESOLVED.id,
        closedAt: '2026-10-22T10:00:00.000Z',
      }),
    ],
  });
  fake.state.users.push(memberOf(RITA, ROLE_BADGES.requester));
  return fake;
}

/** The keys of the issues listed, in order. */
async function listedKeys(): Promise<string[]> {
  await expect.element(page.getByRole('table')).toBeVisible();
  const cells = page
    .getByRole('row')
    .getByRole('cell')
    .filter({ hasText: /^WEB-\d+$/ });
  return cells.elements().map((cell) => cell.textContent ?? '');
}

const header = (name: string) => page.getByRole('columnheader', { name });

const filter = (name: string | RegExp) =>
  page.getByRole('group', { name: 'Filters' }).getByRole('button', { name });

/** Expects the `index`th group of the page under its name, with its size as read aloud. */
async function expectGroup(index: number, name: string, size: string) {
  const title = page
    .getByRole('row')
    .filter({ hasText: /\d+ issues?$/ })
    .nth(index);
  await expect.element(title.getByText(name, { exact: true })).toBeVisible();
  await expect.element(title.getByText(size, { exact: true })).toBeInTheDocument();
}

describe('the list of a project’s issues', () => {
  it('shows the open issues by default, the closed ones on demand', async () => {
    server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB' });

    await expect.element(screen.getByRole('link', { name: 'Broken link' })).toBeVisible();
    expect(await listedKeys()).toStrictEqual(['WEB-3', 'WEB-2', 'WEB-1']);

    await filter('State: Open').click();
    await screen.getByRole('menuitemradio', { name: 'Closed' }).click();
    await expect.element(screen.getByRole('link', { name: 'Old crash' })).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'WEB', state: 'closed' });

    await filter('State: Closed').click();
    await screen.getByRole('menuitemradio', { name: 'All' }).click();
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).toBeVisible();
    expect(await listedKeys()).toStrictEqual(['WEB-4', 'WEB-3', 'WEB-2', 'WEB-1']);
  });

  it('searches once typing pauses, keeping the search in the address', async () => {
    const fake = server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB' });

    await screen.getByRole('searchbox', { name: 'Search issues' }).fill('about');

    await expect.element(screen.getByText('Export is empty')).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'WEB', q: 'about' });
    expect(fake.requests.map(({ path }) => path)).toContain(
      '/api/v1/projects/WEB/issues?search=about&state=open',
    );
  });

  it('filters by several statuses at once, then clears every filter', async () => {
    server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB&state=all' });

    await filter('Status').click();
    await screen.getByRole('menuitemcheckbox', { name: 'New' }).click();
    await screen.getByRole('menuitemcheckbox', { name: 'Resolved' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(filter('Status: New +1')).toBeVisible();
    await expect.element(screen.getByText('Export is empty')).not.toBeInTheDocument();
    expect(await listedKeys()).toStrictEqual(['WEB-4', 'WEB-3', 'WEB-1']);
    expect(router.state.location.search).toEqual({
      project: 'WEB',
      state: 'all',
      status: `${NEW.id},${RESOLVED.id}`,
    });

    await screen.getByRole('button', { name: 'Clear the filters' }).click();
    await expect.element(filter('Status')).toBeVisible();
    expect(router.state.location.search).toEqual({ project: 'WEB' });
    await expect
      .element(screen.getByRole('button', { name: 'Clear the filters' }))
      .not.toBeInTheDocument();
  });

  it('keeps the issues of the signed-in person, or of no one', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await filter('Assignee').click();
    await screen.getByRole('menuitemcheckbox', { name: 'Me' }).click();
    await screen.getByRole('menuitemcheckbox', { name: 'Unassigned' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(screen.getByText('Export is empty')).not.toBeInTheDocument();
    expect(await listedKeys()).toStrictEqual(['WEB-3', 'WEB-1']);
  });

  it('offers the project’s people in the people filters', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await filter('Requester').click();
    await screen.getByRole('menuitemcheckbox', { name: 'Rita Client' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(filter('Requester: Rita Client')).toBeVisible();
    expect(await listedKeys()).toStrictEqual(['WEB-3']);
  });

  it('says when nothing matches, and offers to clear the filters', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB&q=nothing%20like%20this' });

    await expect.element(screen.getByText('No issue matches')).toBeVisible();
    await screen.getByRole('button', { name: 'Clear the filters' }).click();
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).toBeVisible();
    await expect.element(screen.getByRole('searchbox', { name: 'Search issues' })).toHaveValue('');
  });

  it('sorts by a column from its header, the other way round on a second click', async () => {
    server();
    const { router } = await renderApp({ path: '/issues?project=WEB' });

    await expect.element(header('Key')).toHaveAttribute('aria-sort', 'descending');
    await header('Priority').getByRole('button').click();
    await expect.element(header('Priority')).toHaveAttribute('aria-sort', 'descending');
    await expect.poll(listedKeys).toStrictEqual(['WEB-2', 'WEB-1', 'WEB-3']);

    await header('Priority').getByRole('button').click();
    await expect.element(header('Priority')).toHaveAttribute('aria-sort', 'ascending');
    await expect.poll(listedKeys).toStrictEqual(['WEB-3', 'WEB-1', 'WEB-2']);
    await expect.element(header('Key')).not.toHaveAttribute('aria-sort');
    expect(router.state.location.search).toEqual({
      project: 'WEB',
      sort: 'priority',
      order: 'asc',
    });
  });

  it('draws the line between rows in its color at once when rows move', async () => {
    server();
    await renderApp({ path: '/issues?project=WEB&sort=priority' });
    await expect.poll(listedKeys).toStrictEqual(['WEB-2', 'WEB-1', 'WEB-3']);

    await header('Priority').getByRole('button').click();
    await expect.poll(listedKeys).toStrictEqual(['WEB-3', 'WEB-1', 'WEB-2']);

    // The last row, now first, gets the line the others have, never a dark one fading out.
    const line = (key: string) =>
      getComputedStyle(page.getByRole('row').filter({ hasText: key }).element()).borderBottomColor;
    expect(line('WEB-3')).toBe(line('WEB-1'));
  });

  it('groups, each group under its title with its size, sorted inside', async () => {
    server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB&sort=priority' });

    await screen.getByRole('button', { name: 'Group: None' }).click();
    await screen.getByRole('menuitemradio', { name: 'Status' }).click();

    await expectGroup(0, 'New', '2 issues');
    await expectGroup(1, 'In progress', '1 issue');
    expect(await listedKeys()).toStrictEqual(['WEB-1', 'WEB-3', 'WEB-2']);
    expect(router.state.location.search).toEqual({
      project: 'WEB',
      sort: 'priority',
      group: 'status',
    });
  });

  it('reads what to show from the address', async () => {
    server();
    const { screen } = await renderApp({
      path: `/issues?project=WEB&priority=${URGENT.id},not-an-id&group=assignee&sort=title&order=up`,
    });

    await expect.element(filter('Priority: Urgent')).toBeVisible();
    await expectGroup(0, 'Grace Hopper', '1 issue');
    await expect.element(header('Subject')).toHaveAttribute('aria-sort', 'ascending');
    await expect.element(screen.getByRole('button', { name: 'Group: Assignee' })).toBeVisible();
  });

  it('leaves the requester filter out for whoever sees only their own issues', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await expect.element(screen.getByRole('link', { name: 'Invoice missing' })).toBeVisible();
    await expect.element(filter('Assignee')).toBeVisible();
    await expect.element(filter('Requester')).not.toBeInTheDocument();
  });

  it('shows cards on phones, under the title of their group, sorted from a menu', async () => {
    await page.viewport(375, 800);
    server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB&group=priority' });

    const urgent = screen.getByRole('heading', { level: 2, name: /Urgent/ });
    await expect.element(urgent).toBeVisible();
    await expect.element(screen.getByRole('table')).not.toBeInTheDocument();
    const card = screen.getByRole('listitem').filter({ hasText: 'WEB-2' });
    await expect.element(card.getByRole('link', { name: 'Export is empty' })).toBeVisible();
    await expect.element(card.getByText('Grace Hopper')).toBeVisible();

    await screen.getByRole('button', { name: 'Sort: Key' }).click();
    await screen.getByRole('menuitemradio', { name: 'Updated' }).click();
    await screen.getByRole('button', { name: 'Sort: Updated' }).click();
    await screen.getByRole('menuitemradio', { name: 'Ascending' }).click();
    await expect
      .poll(() => router.state.location.search)
      .toEqual({ project: 'WEB', group: 'priority', sort: 'updated', order: 'asc' });
  });
});
