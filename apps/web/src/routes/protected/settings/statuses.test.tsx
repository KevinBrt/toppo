import { DEFAULT_STATUSES } from '@toppo-tracker/core';
import type { WorkflowRequest } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeServer,
  GRACE,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const NEW = defaultField(DEFAULT_STATUSES, 'new').id;
const TO_DO = defaultField(DEFAULT_STATUSES, 'toDo').id;
const IN_PROGRESS = defaultField(DEFAULT_STATUSES, 'inProgress').id;
const RESOLVED = defaultField(DEFAULT_STATUSES, 'resolved').id;

/** The workflow the editor last saved, as the fake server received it. */
function lastSave(fake: ReturnType<typeof fakeServer>): WorkflowRequest | undefined {
  return fake.requests.findLast(
    ({ method, path }) => method === 'PUT' && path === '/api/v1/workflow',
  )?.body as WorkflowRequest | undefined;
}

const move = (from: string, to: string) =>
  page.getByRole('checkbox', { name: `From ${from} to ${to}` });
const save = () => page.getByRole('button', { name: 'Save' }).click();

describe('the statuses screen', () => {
  it('lists the statuses with their issues, the initial one, and the moves between them', async () => {
    fakeServer({ user: ADA, issues: [fakeIssue('WEB', 1, 'Broken link')] });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Statuses' })).toBeVisible();
    const statuses = screen.getByRole('region', { name: 'Statuses of the workflow' });
    const first = statuses.getByRole('listitem').first();
    await expect.element(first.getByText('New', { exact: true })).toBeVisible();
    await expect.element(first.getByText('Initial status')).toBeVisible();
    await expect.element(first.getByText('1 issue')).toBeVisible();
    await expect
      .element(screen.getByRole('checkbox', { name: 'Closes the issue: Resolved' }))
      .toBeChecked();
    await expect
      .element(screen.getByRole('checkbox', { name: 'Closes the issue: New' }))
      .toBeDisabled();
    await expect.element(move('New', 'To do')).toBeChecked();
    await expect.element(move('Resolved', 'New')).not.toBeChecked();
    // The summary tells about the first row until another is pointed at.
    await expect
      .element(screen.getByText(/^An issue\s*New\s*may move to\s*To do\s*In progress\s*Resolved$/))
      .toBeVisible();
  });

  it('is kept from those who do not manage the settings', async () => {
    fakeServer({ user: GRACE });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
  });
});

describe('editing the workflow', () => {
  it('saves its changes together: a move allowed, a status added', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    await move('Resolved', 'New').click();
    await screen.getByRole('button', { name: 'Add a status' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New status' });
    await dialog.getByLabelText('Name').fill('Review');
    await dialog.getByRole('radio', { name: 'Pink' }).click();
    await dialog.getByRole('checkbox', { name: /Closes the issue/ }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect.element(screen.getByText('2 unsaved changes')).toBeVisible();
    await save();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    const saved = lastSave(fake);
    expect(saved?.transitions).toContainEqual({ from: RESOLVED, to: NEW });
    expect(saved?.statuses.at(-1)).toMatchObject({
      name: 'Review',
      color: 'pink',
      closes: true,
      isInitial: false,
    });
    await expect.element(screen.getByText('2 unsaved changes')).not.toBeInTheDocument();
    await expect.element(move('Review', 'New')).toBeVisible();
  });

  it('moves the issues of a status taken out to the one chosen', async () => {
    const fake = fakeServer({
      user: ADA,
      issues: [fakeIssue('WEB', 1, 'Broken link', { statusId: IN_PROGRESS })],
    });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    await screen.getByRole('button', { name: 'Actions for In progress' }).click();
    await screen.getByRole('menuitem', { name: 'Remove' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Remove “In progress”?' });
    await expect
      .element(dialog)
      .toHaveAccessibleDescription('1 issue is on it: choose the status it moves to.');
    await dialog.getByRole('combobox', { name: 'Move them to' }).selectOptions('To do');
    await dialog.getByRole('button', { name: 'Remove the status' }).click();
    await save();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    expect(lastSave(fake)?.removed).toStrictEqual([{ statusId: IN_PROGRESS, moveTo: TO_DO }]);
    expect(fake.state.issues[0]?.statusId).toBe(TO_DO);
  });

  it('lets issues move freely, keeping the moves for later', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    // The radio button hides behind its label, which takes the click.
    await screen.getByText('Free', { exact: true }).click();
    await expect.element(move('New', 'To do')).not.toBeInTheDocument();
    await expect
      .element(
        screen.getByText('An issue may move from any status to any other.', { exact: false }),
      )
      .toBeVisible();
    await save();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    expect(lastSave(fake)?.mode).toBe('free');
    expect(lastSave(fake)?.transitions).toContainEqual({ from: NEW, to: TO_DO });
  });

  it('puts statuses in order with the keyboard', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    const handle = screen.getByRole('button', { name: 'Move Resolved' });
    await expect.element(handle).toBeVisible();
    handle.element().focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    await save();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    expect(lastSave(fake)?.statuses.map(({ name }) => name)).toStrictEqual([
      'New',
      'To do',
      'In progress',
      'Resolved',
      'Waiting',
    ]);
  });

  it('refuses a name another status has, and keeps the initial status where it is', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    await screen.getByRole('button', { name: 'Add a status' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New status' });
    await dialog.getByLabelText('Name').fill('new');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect
      .element(dialog.getByLabelText('Name'))
      .toHaveAccessibleDescription('Another status has this name.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await screen.getByRole('button', { name: 'Actions for New' }).click();
    await expect
      .element(screen.getByRole('menuitem', { name: 'Remove' }))
      .toHaveAttribute('aria-disabled', 'true');
    await expect
      .element(screen.getByRole('menuitem', { name: 'Make it the initial status' }))
      .toHaveAttribute('aria-disabled', 'true');
  });

  it('asks before leaving with unsaved changes', async () => {
    fakeServer({ user: ADA });
    const { screen, router } = await renderApp({ path: '/settings/statuses' });

    await move('Resolved', 'New').click();
    await screen
      .getByRole('navigation', { name: 'Settings sections' })
      .getByRole('link', { name: 'Members' })
      .click();

    await expect
      .element(screen.getByRole('dialog', { name: 'Leave without saving?' }))
      .toBeVisible();
    await screen.getByRole('button', { name: 'Stay' }).click();
    expect(router.state.location.pathname).toBe('/settings/statuses');
    await expect.element(move('Resolved', 'New')).toBeChecked();
  });

  it('lists the moves one status at a time on phones', async () => {
    await page.viewport(375, 812);
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/statuses' });

    const fromResolved = screen.getByRole('group', { name: /Resolved/ });
    await fromResolved.getByRole('checkbox', { name: 'New' }).click();
    await save();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    expect(lastSave(fake)?.transitions).toContainEqual({ from: RESOLVED, to: NEW });
  });
});
