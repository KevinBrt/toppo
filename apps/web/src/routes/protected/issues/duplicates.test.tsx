import { DEFAULT_STATUSES } from '@toppo/core';
import { type CurrentUser, NOTIFICATION_EVENTS } from '@toppo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeProject,
  fakeServer,
  memberOf,
  ROLE_BADGES,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const RESOLVED = defaultField(DEFAULT_STATUSES, 'resolved');

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

/**
 * WEB, with Ada and Rita in it: WEB-1 and WEB-2 new, WEB-3 already a duplicate of WEB-1, WEB-4
 * Rita's, a duplicate of WEB-1 too.
 */
function server(user: CurrentUser = ADA) {
  const fake = fakeServer({
    user,
    projects: [
      fakeProject('WEB', 'Website', {
        members: [
          { userId: ADA.id, roleId: null },
          { userId: RITA.id, roleId: null },
        ],
      }),
    ],
    issues: [
      fakeIssue('WEB', 1, 'Export is empty'),
      fakeIssue('WEB', 2, 'Empty CSV export'),
      fakeIssue('WEB', 3, 'Nothing in the export', {
        statusId: RESOLVED.id,
        duplicateOfKey: 'WEB-1',
      }),
      fakeIssue('WEB', 4, 'My export is empty', {
        reporterId: RITA.id,
        statusId: RESOLVED.id,
        duplicateOfKey: 'WEB-1',
      }),
    ],
  });
  fake.state.users.push(memberOf(RITA, ROLE_BADGES.requester));
  return fake;
}

async function openMarking() {
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'Mark as a duplicate…' }).click();
}

describe('duplicates', () => {
  it('are marked from the issue, the original searched for, and closed at once', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/WEB-2' });

    await openMarking();
    const dialog = screen.getByRole('dialog', { name: 'Mark WEB-2 as a duplicate' });
    await expect
      .element(dialog.getByRole('button', { name: 'Mark as a duplicate' }))
      .toBeDisabled();
    await dialog.getByRole('searchbox', { name: 'Original issue' }).fill('export');
    await dialog.getByRole('radio', { name: /WEB-1/ }).click();
    await expect.element(dialog.getByRole('radio', { name: /WEB-2/ })).not.toBeInTheDocument();
    await expect
      .element(dialog.getByRole('combobox', { name: 'Closed as' }))
      .toHaveValue(RESOLVED.id);
    await dialog.getByRole('button', { name: 'Mark as a duplicate' }).click();

    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('region', { name: 'This issue is a duplicate' }))
      .toBeVisible();
    await expect
      .element(
        screen
          .getByRole('region', { name: 'This issue is a duplicate' })
          .getByRole('link', { name: /WEB-1 Export is empty New/ }),
      )
      .toBeVisible();
    // Marked and closed together: one step of the history, unfolded on demand.
    const activity = screen.getByRole('region', { name: 'Activity' });
    await activity.getByRole('button', { name: 'Details' }).click();
    await expect.element(activity.getByText('Duplicate of:')).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: '/api/v1/issues/WEB-2/duplicate-of',
      body: { originalKey: 'WEB-1', statusId: RESOLVED.id },
    });
  });

  it('refuse an original that would loop back, saying why', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await openMarking();
    const dialog = screen.getByRole('dialog', { name: 'Mark WEB-1 as a duplicate' });
    await dialog.getByRole('searchbox', { name: 'Original issue' }).fill('export');
    await dialog.getByRole('radio', { name: /WEB-3/ }).click();
    await dialog.getByRole('button', { name: 'Mark as a duplicate' }).click();

    await expect
      .element(dialog.getByText('An issue cannot be a duplicate of itself, even through others.'))
      .toBeVisible();
  });

  it('show on their original, and lose the mark on demand', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    const duplicates = screen.getByRole('region', { name: '2 duplicates' });
    await expect.element(duplicates.getByRole('link', { name: /WEB-3/ })).toBeVisible();
    await duplicates.getByRole('link', { name: /WEB-3/ }).click();

    await expect
      .element(screen.getByRole('region', { name: 'This issue is a duplicate' }))
      .toBeVisible();
    // A duplicate loses its mark before it is marked again.
    await screen.getByRole('button', { name: 'More actions' }).click();
    await expect.element(screen.getByRole('menuitem', { name: 'Delete the issue' })).toBeVisible();
    await expect
      .element(screen.getByRole('menuitem', { name: 'Mark as a duplicate…' }))
      .not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await screen.getByRole('button', { name: 'Not a duplicate' }).click();
    await expect
      .element(screen.getByRole('region', { name: 'This issue is a duplicate' }))
      .not.toBeInTheDocument();
    expect(fake.requests).toContainEqual({
      method: 'DELETE',
      path: '/api/v1/issues/WEB-3/duplicate-of',
      body: undefined,
    });
  });

  it('name an original out of the reader’s sight by nothing, and offer them nothing', async () => {
    server(RITA);
    const { screen } = await renderApp({ path: '/issues/WEB-4' });

    await expect
      .element(screen.getByText('Its original is an issue you cannot see.'))
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: 'Not a duplicate' }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'More actions' }))
      .not.toBeInTheDocument();
  });
});
