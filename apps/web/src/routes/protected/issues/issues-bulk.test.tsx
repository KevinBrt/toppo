import { DEFAULT_STATUSES } from '@toppo-tracker/core';
import { type CurrentUser, NOTIFICATION_EVENTS } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
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

const IN_PROGRESS = defaultField(DEFAULT_STATUSES, 'inProgress');
const WAITING = defaultField(DEFAULT_STATUSES, 'waiting');
const MOBILE = {
  id: '01a1569b-9900-7000-8000-000000001101',
  name: 'Mobile',
  color: 'blue',
} as const;

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

/** WEB, with Ada, Grace and Rita in it: WEB-1 and WEB-3 (Rita's) new, WEB-2 in progress. */
function server(user: CurrentUser = ADA, { archived = false } = {}) {
  const fake = fakeServer({
    user,
    projects: [
      fakeProject('WEB', 'Website', {
        archived,
        members: [
          { userId: ADA.id, roleId: null },
          { userId: GRACE.id, roleId: null },
          { userId: RITA.id, roleId: null },
        ],
      }),
    ],
    issues: [
      fakeIssue('WEB', 1, 'Broken link'),
      fakeIssue('WEB', 2, 'Export is empty', { statusId: IN_PROGRESS.id }),
      fakeIssue('WEB', 3, 'Invoice missing', { reporterId: RITA.id }),
    ],
    labels: [MOBILE],
  });
  fake.state.users.push(memberOf(RITA, ROLE_BADGES.requester));
  return fake;
}

const tick = (key: string) => page.getByRole('checkbox', { name: `Select ${key}` });
const bar = () => page.getByRole('region', { name: 'Selected issues' });
/** Confirms the action chosen, asked as `question`. */
const confirm = (question: string) =>
  page.getByRole('dialog', { name: question }).getByRole('button', { name: 'Apply' }).click();

describe('actions on several issues', () => {
  it('move the ticked issues, naming those the workflow keeps, which stay ticked', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-1').click();
    await tick('WEB-2').click();
    await expect.element(bar().getByText('2 selected')).toBeVisible();
    await bar().getByRole('button', { name: 'Status' }).click();
    await expect.element(screen.getByRole('menu').getByText('Move 2 issues to')).toBeVisible();
    await screen.getByRole('menuitem', { name: 'Waiting' }).click();
    await confirm('Move 2 issues to “Waiting”?');

    await expect.element(screen.getByText('1 issue changed.')).toBeVisible();
    await expect
      .element(
        screen.getByText('Not moved, as the workflow does not allow it from their status: WEB-1.'),
      )
      .toBeVisible();
    await expect.element(tick('WEB-1')).toBeChecked();
    await expect.element(tick('WEB-2')).not.toBeChecked();
    expect(fake.state.issues.find(({ number }) => number === 2)?.statusId).toBe(WAITING.id);
    expect(fake.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/projects/WEB/issues/bulk/status',
      body: { issueKeys: ['WEB-1', 'WEB-2'], statusId: WAITING.id },
    });
  });

  it('tick the whole page at once, then give it to someone', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });
    const pageBox = screen.getByRole('checkbox', { name: 'Select every issue of the page' });

    await tick('WEB-1').click();
    await expect.element(pageBox).toBePartiallyChecked();
    await pageBox.click();
    await expect.element(bar().getByText('3 selected')).toBeVisible();
    await bar().getByRole('button', { name: 'Assignee' }).click();
    await screen
      .getByRole('dialog', { name: 'Assign 3 issues' })
      .getByRole('button', { name: /Grace Hopper/ })
      .click();
    await confirm('Assign 3 issues to Grace Hopper?');

    await expect.element(screen.getByText('3 issues changed.')).toBeVisible();
    await expect.element(bar()).not.toBeInTheDocument();
    expect(fake.state.issues.every(({ assigneeId }) => assigneeId === GRACE.id)).toBe(true);
  });

  it('add a label and take it off', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-3').click();
    await bar().getByRole('button', { name: 'Labels' }).click();
    await screen.getByRole('menuitem', { name: 'Add Mobile' }).click();
    await confirm('Add the label “Mobile” to 1 issue?');
    await expect.element(screen.getByText('1 issue changed.')).toBeVisible();
    expect(fake.state.issues.find(({ number }) => number === 3)?.labelIds).toStrictEqual([
      MOBILE.id,
    ]);

    await tick('WEB-3').click();
    await bar().getByRole('button', { name: 'Labels' }).click();
    await screen.getByRole('menuitem', { name: 'Add Mobile' }).click();
    await confirm('Add the label “Mobile” to 1 issue?');
    await expect
      .element(screen.getByText('Nothing to change: the selected issues already were so.'))
      .toBeVisible();
    await tick('WEB-3').click();
    await bar().getByRole('button', { name: 'Labels' }).click();
    await screen.getByRole('menuitem', { name: 'Remove Mobile' }).click();
    await confirm('Remove the label “Mobile” from 1 issue?');
    await expect.element(screen.getByText('1 issue changed.')).toBeVisible();
  });

  it('delete after asking, and are left alone when cancelled', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-1').click();
    await tick('WEB-3').click();
    await bar().getByRole('button', { name: 'Delete' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete 2 issues?' });
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect.element(tick('WEB-1')).toBeChecked();

    await bar().getByRole('button', { name: 'Delete' }).click();
    await dialog.getByRole('button', { name: 'Delete for good' }).click();

    await expect.element(screen.getByText('2 issues deleted.')).toBeVisible();
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('link', { name: 'Export is empty' })).toBeVisible();
  });

  it('change nothing when the confirmation is cancelled', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-1').click();
    await bar().getByRole('button', { name: 'Category' }).click();
    await screen.getByRole('menuitem', { name: 'Bug' }).click();
    await screen
      .getByRole('dialog', { name: 'Give 1 issue the category “Bug”?' })
      .getByRole('button', { name: 'Cancel' })
      .click();

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect.element(tick('WEB-1')).toBeChecked();
    expect(fake.requests.map(({ path }) => path)).not.toContain(
      '/api/v1/projects/WEB/issues/bulk/fields',
    );
  });

  it('clear the ticks on demand and with another page of the list', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-1').click();
    await bar().getByRole('button', { name: 'Clear the selection' }).click();
    await expect.element(bar()).not.toBeInTheDocument();

    await tick('WEB-1').click();
    await screen.getByRole('searchbox', { name: 'Search issues' }).fill('Export');
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).not.toBeInTheDocument();
    await expect.element(bar()).not.toBeInTheDocument();
  });

  it('are offered to nobody who may not change issues', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });
    await expect.element(screen.getByRole('link', { name: 'Invoice missing' })).toBeVisible();
    await expect.element(tick('WEB-3')).not.toBeInTheDocument();
  });

  it('are not offered on an archived project', async () => {
    server(ADA, { archived: true });
    const { screen } = await renderApp({ path: '/issues?project=WEB' });
    await expect.element(screen.getByRole('link', { name: 'Broken link' })).toBeVisible();
    await expect.element(tick('WEB-1')).not.toBeInTheDocument();
  });

  it('tick cards on phones, the bar within reach', async () => {
    await page.viewport(375, 740);
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await tick('WEB-2').click();
    await bar().getByRole('button', { name: 'Priority' }).click();
    await screen.getByRole('menuitem', { name: 'Urgent' }).click();
    await confirm('Give 1 issue the priority “Urgent”?');

    await expect.element(screen.getByText('1 issue changed.')).toBeVisible();
  });
});
