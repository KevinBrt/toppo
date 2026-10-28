import { DEFAULT_PRIORITIES, DEFAULT_STATUSES } from '@toppo-tracker/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeProject,
  fakeServer,
  GRACE,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const URGENT = defaultField(DEFAULT_PRIORITIES, 'urgent');
const HIGH = defaultField(DEFAULT_PRIORITIES, 'high');
const RESOLVED = defaultField(DEFAULT_STATUSES, 'resolved');

/** Ada and Grace in WEB, API and the archived OLD; issues given to Grace in each. */
function server() {
  return fakeServer({
    user: GRACE,
    projects: [
      fakeProject('WEB', 'Website'),
      fakeProject('API', 'Zeta API'),
      fakeProject('OLD', 'Old site', { archived: true }),
    ],
    issues: [
      fakeIssue('WEB', 1, 'Broken link', { assigneeId: GRACE.id }),
      fakeIssue('WEB', 2, 'Export is empty', { priorityId: URGENT.id, assigneeId: GRACE.id }),
      fakeIssue('WEB', 3, 'Not hers', { priorityId: URGENT.id, assigneeId: ADA.id }),
      fakeIssue('API', 1, 'Rate limit too low', {
        priorityId: HIGH.id,
        statusId: RESOLVED.id,
        closedAt: '2026-10-22T10:00:00.000Z',
        assigneeId: GRACE.id,
      }),
      fakeIssue('OLD', 1, 'Legacy page', { priorityId: URGENT.id, assigneeId: GRACE.id }),
    ],
  });
}

const row = (index: number) => page.getByRole('row').nth(index);

describe('my issues', () => {
  it('lists those assigned to me in every project, open or closed, the most urgent first', async () => {
    server();
    const { screen } = await renderApp({ path: '/my-issues' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'My issues' }))
      .toBeVisible();
    await expect.element(row(1).filter({ hasText: 'WEB-2' })).toBeVisible();
    await expect.element(row(2).filter({ hasText: 'Zeta API' })).toBeVisible();
    await expect.element(row(2).filter({ hasText: 'Resolved' })).toBeVisible();
    await expect.element(row(3).filter({ hasText: 'WEB-1' })).toBeVisible();
    // Neither someone else's issue nor one of an archived project.
    expect(screen.getByRole('row').elements()).toHaveLength(4);
    await expect.element(screen.getByText('3 issues shown')).toBeVisible();

    await screen.getByRole('link', { name: 'Export is empty' }).click();
    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Export is empty' }))
      .toBeVisible();
  });

  it('says when nothing is assigned to me', async () => {
    fakeServer({
      user: ADA,
      projects: [fakeProject('WEB', 'Website')],
      issues: [fakeIssue('WEB', 1, 'Broken link', { assigneeId: GRACE.id })],
    });
    const { screen } = await renderApp({ path: '/my-issues' });

    await expect.element(screen.getByText('Nothing assigned to you')).toBeVisible();
    await expect.element(screen.getByText('Broken link')).not.toBeInTheDocument();
  });
});
