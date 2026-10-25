import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  fakeIssue,
  fakeNotification,
  fakeProject,
  fakeServer,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

/** Ada, who reaches WEB and has these notifications. */
function server(notifications = [fakeNotification(1)]) {
  return fakeServer({
    user: ADA,
    projects: [fakeProject('WEB', 'Website', { members: [{ userId: ADA.id, roleId: null }] })],
    issues: [fakeIssue('WEB', 1, 'Empty CSV export'), fakeIssue('WEB', 2, 'Crash on phones')],
    notifications,
  });
}

const bell = () => page.getByRole('button', { name: /^Notifications/ });

describe('the bell', () => {
  it('says how many notifications are unread, and lists the latest', async () => {
    server([
      fakeNotification(1),
      fakeNotification(2, {
        event: 'statusChanged',
        status: 'Resolved',
        issue: { key: 'WEB-2', title: 'Crash on phones' },
      }),
      fakeNotification(3, { event: 'commented', readAt: '2026-10-24T08:00:00.000Z' }),
    ]);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await expect.element(bell()).toHaveAccessibleName('Notifications, 2 unread');
    await expect.element(bell()).toHaveTextContent('2');
    await bell().click();

    await expect
      .element(screen.getByRole('menuitem', { name: /Grace Hopper assigned you WEB-1/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('menuitem', { name: /Grace Hopper moved WEB-2 to “Resolved”/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('menuitem', { name: /^Grace Hopper commented on WEB-1/ }))
      .toBeVisible();
  });

  it('opens the issue of a notification, which is then read', async () => {
    const fake = server();
    const { screen, router } = await renderApp({ path: '/issues?project=WEB' });

    await bell().click();
    await screen.getByRole('menuitem', { name: /Grace Hopper assigned you WEB-1/ }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Empty CSV export' }))
      .toBeVisible();
    expect(router.state.location.pathname).toBe('/issues/WEB-1');
    await expect.element(bell()).toHaveAccessibleName('Notifications');
    expect(fake.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/notifications/read',
      body: { ids: [fake.state.notifications[0]?.id] },
    });
  });

  it('marks every notification read at once', async () => {
    server([fakeNotification(1), fakeNotification(2)]);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await bell().click();
    await screen.getByRole('menuitem', { name: 'Mark all as read' }).click();
    // The menu stays open, to see them read; the bell is back once it closes.
    await expect
      .element(screen.getByRole('menuitem', { name: 'Mark all as read' }))
      .not.toBeInTheDocument();
    await userEvent.keyboard('{Escape}');

    await expect.element(bell()).toHaveAccessibleName('Notifications');
  });

  it('tells of a new issue', async () => {
    server([fakeNotification(1, { event: 'created' })]);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await bell().click();

    await expect
      .element(screen.getByRole('menuitem', { name: /Grace Hopper created WEB-1/ }))
      .toBeVisible();
  });

  it('tells to whom an issue went, or that it went to no one', async () => {
    server([
      fakeNotification(1, {
        event: 'assigneeChanged',
        assignee: { id: ADA.id, name: 'Alan Turing' },
      }),
      fakeNotification(2, { event: 'assigneeChanged', assignee: { id: ADA.id, name: null } }),
      fakeNotification(3, { event: 'assigneeChanged', assignee: null }),
    ]);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await bell().click();

    for (const sentence of [
      /Grace Hopper assigned WEB-1 to Alan Turing/,
      /Grace Hopper assigned WEB-1 to Deleted user/,
      /Grace Hopper unassigned WEB-1/,
    ]) {
      await expect.element(screen.getByRole('menuitem', { name: sentence })).toBeVisible();
    }
  });

  it('tells of an issue marked as a duplicate, or no longer', async () => {
    server([
      fakeNotification(1, {
        event: 'duplicateChanged',
        original: { key: 'WEB-2', title: 'Crash on phones' },
      }),
      fakeNotification(2, { event: 'duplicateChanged', original: { key: null, title: null } }),
      fakeNotification(3, { event: 'duplicateChanged', original: null }),
    ]);
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await bell().click();

    for (const sentence of [
      /Grace Hopper marked WEB-1 as a duplicate of WEB-2/,
      /Grace Hopper marked WEB-1 as a duplicate of an issue you cannot see/,
      /Grace Hopper took the duplicate mark off WEB-1/,
    ]) {
      await expect.element(screen.getByRole('menuitem', { name: sentence })).toBeVisible();
    }
  });

  it('shows 9+ beyond nine unread', async () => {
    server(Array.from({ length: 12 }, (_, index) => fakeNotification(index + 1)));
    await renderApp({ path: '/issues?project=WEB' });

    await expect.element(bell()).toHaveAccessibleName('Notifications, 12 unread');
    await expect.element(bell()).toHaveTextContent('9+');
  });
});

describe('the notifications page', () => {
  it('lists every notification, page by page', async () => {
    server(Array.from({ length: 25 }, (_, index) => fakeNotification(index + 1)));
    const { screen } = await renderApp({ path: '/notifications' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Notifications' }))
      .toBeVisible();
    await expect.element(screen.getByText('1–20 of 25')).toBeVisible();
    await screen.getByRole('button', { name: 'Next' }).click();
    await expect.element(screen.getByText('21–25 of 25')).toBeVisible();
  });

  it('says when there is nothing yet', async () => {
    server([]);
    const { screen } = await renderApp({ path: '/notifications' });

    await expect.element(screen.getByText('No notifications yet.')).toBeVisible();
  });

  it('reads in French', async () => {
    server([
      fakeNotification(1, { event: 'mentioned' }),
      fakeNotification(2, { event: 'assigneeChanged', assignee: { id: ADA.id, name: 'Ada' } }),
    ]);
    const { screen } = await renderApp({ path: '/notifications', locale: 'fr' });

    await expect
      .element(screen.getByRole('link', { name: /Grace Hopper vous a mentionné dans WEB-1/ }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('link', { name: /Grace Hopper a assigné WEB-1 à Ada/ }))
      .toBeVisible();
  });
});
