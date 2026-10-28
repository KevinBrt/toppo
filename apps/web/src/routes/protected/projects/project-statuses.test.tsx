import { DEFAULT_STATUSES } from '@toppo-tracker/core';
import type { WorkflowRequest } from '@toppo-tracker/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  defaultField,
  defaultWorkflow,
  fakeIssue,
  fakeProject,
  fakeServer,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 900);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const TO_DO = defaultField(DEFAULT_STATUSES, 'toDo').id;
const REVIEW = '01a1569b-9900-7000-8000-000000000777';

/** Ada manages WEB, which has one issue, and follows the instance's workflow unless said otherwise. */
function server(archived = false) {
  return fakeServer({
    user: ADA,
    projects: [fakeProject('WEB', 'Website', { archived })],
    issues: [fakeIssue('WEB', 1, 'Broken link')],
  });
}

const move = (from: string, to: string) =>
  page.getByRole('checkbox', { name: `From ${from} to ${to}` });

describe('a project’s statuses', () => {
  it('show the organization’s workflow while the project follows it', async () => {
    server();
    const { screen } = await renderApp({ path: '/projects/WEB/statuses' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Statuses' })).toBeVisible();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Project sections' })
          .getByRole('link', { name: 'Statuses' }),
      )
      .toHaveAttribute('aria-current', 'page');
    await expect
      .element(
        screen.getByText('This project follows the organization’s workflow', { exact: false }),
      )
      .toBeVisible();
    await expect.element(move('New', 'To do')).toBeChecked();
    await expect.element(move('New', 'To do')).toBeDisabled();
    await expect
      .element(screen.getByRole('button', { name: 'Add a status' }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: 'Customize for this project' }))
      .toBeVisible();
  });

  it('are customized, then edited for the project only, the organization’s kept as they are', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/projects/WEB/statuses' });

    await screen.getByRole('button', { name: 'Customize for this project' }).click();
    await expect
      .element(screen.getByText('This project has a workflow of its own', { exact: false }))
      .toBeVisible();
    await expect
      .element(screen.getByRole('checkbox', { name: 'Closes the issue: Resolved' }))
      .toBeDisabled();
    await screen.getByRole('button', { name: 'Actions for To do' }).click();
    await expect
      .element(screen.getByRole('menuitem', { name: 'Edit' }))
      .toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('menuitem', { name: 'Make it the initial status' }).click();
    await screen.getByRole('button', { name: 'Add a status' }).click();
    const dialog = screen.getByRole('dialog', { name: 'New status' });
    await dialog.getByLabelText('Name').fill('Review');
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await screen.getByRole('button', { name: 'Save' }).click();

    await expect.element(screen.getByText('Workflow saved.')).toBeVisible();
    const body = fake.requests.findLast(
      ({ method, path }) => method === 'PUT' && path === '/api/v1/projects/WEB/workflow',
    )?.body as WorkflowRequest | undefined;
    expect(body?.statuses.find(({ isInitial }) => isInitial)?.ref).toBe(TO_DO);
    expect(body?.statuses.at(-1)?.name).toBe('Review');
    expect(fake.state.workflow.statuses.map(({ name }) => name)).not.toContain('Review');
  });

  it('go back to the organization’s workflow, asking where the project’s issues go', async () => {
    const fake = server();
    const copy = defaultWorkflow();
    copy.statuses.push({
      id: REVIEW,
      name: 'Review',
      color: 'pink',
      closes: false,
      isInitial: false,
    });
    fake.state.projectWorkflows.set('WEB', copy);
    const [issue] = fake.state.issues;
    if (issue) {
      issue.statusId = REVIEW;
    }
    const { screen } = await renderApp({ path: '/projects/WEB/statuses' });

    await screen.getByRole('button', { name: 'Go back to the organization’s workflow' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Go back to the organization’s workflow?' });
    await dialog
      .getByRole('combobox', { name: 'Issues in “Review” (1) go to' })
      .selectOptions('To do');
    await dialog.getByRole('button', { name: 'Go back' }).click();

    await expect
      .element(
        screen.getByText('This project follows the organization’s workflow', { exact: false }),
      )
      .toBeVisible();
    expect(fake.state.issues[0]?.statusId).toBe(TO_DO);
    expect(fake.state.projectWorkflows.has('WEB')).toBe(false);
  });

  it('are only shown in an archived project', async () => {
    server(true);
    const { screen } = await renderApp({ path: '/projects/WEB/statuses' });

    await expect.element(move('New', 'To do')).toBeDisabled();
    await expect
      .element(screen.getByRole('button', { name: 'Customize for this project' }))
      .not.toBeInTheDocument();
  });
});
