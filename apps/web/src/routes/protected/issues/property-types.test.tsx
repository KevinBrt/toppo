import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import type { IssueActivity, PropertyValue } from '@toppo-tracker/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  fakeIssue,
  fakeProject,
  fakeProperty,
  fakeServer,
  GRACE,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

const asked = { askedAtCreation: true } as const;
const PLATFORMS = fakeProperty(1, 'Platforms', ['iOS', 'Android'], {
  type: 'multiSelect',
  ...asked,
});
const REFERENCE = fakeProperty(2, 'Reference', [], { type: 'text', shownInList: true, ...asked });
const ESTIMATE = fakeProperty(3, 'Estimate', [], { type: 'number', ...asked });
const DUE = fakeProperty(4, 'Due', [], { type: 'date', shownInList: true, ...asked });
const REVIEWER = fakeProperty(5, 'Reviewer', [], { type: 'user', ...asked });
const BLOCKING = fakeProperty(6, 'Blocking', [], { type: 'checkbox', shownInList: true, ...asked });
const [IOS, ANDROID] = PLATFORMS.options.map(({ id }) => id);

/** WEB-1 with `values`, in a project Grace reaches with her own role, or `graceRole`. */
function server({
  user = ADA,
  values = {},
  graceRole = null,
}: {
  user?: typeof ADA;
  values?: Record<string, PropertyValue>;
  graceRole?: string | null;
} = {}) {
  return fakeServer({
    user,
    properties: [PLATFORMS, REFERENCE, ESTIMATE, DUE, REVIEWER, BLOCKING],
    projects: [
      fakeProject('WEB', 'Website', {
        members: [
          { userId: ADA.id, roleId: null },
          { userId: GRACE.id, roleId: graceRole },
        ],
      }),
    ],
    issues: [fakeIssue('WEB', 1, 'Crash on phones', { properties: values })],
  });
}

const bodyOf = (fake: ReturnType<typeof server>, method: string, path: string) =>
  fake.requests.findLast((request) => request.method === method && request.path === path)?.body;

const sidebar = () => page.getByRole('complementary', { name: 'Properties' });

describe('the properties of a new issue', () => {
  it('are asked as their type asks, and sent as stored', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    await screen.getByRole('checkbox', { name: 'Android' }).click();
    await screen.getByRole('checkbox', { name: 'iOS' }).click();
    await screen.getByLabelText('Reference').fill(' CUST-42 ');
    await screen.getByLabelText('Estimate').fill('2.5');
    await screen.getByLabelText('Due').fill('2026-11-02');
    await screen.getByRole('button', { name: 'Reviewer, None' }).click();
    await screen
      .getByRole('dialog', { name: 'Reviewer' })
      .getByRole('button', { name: /Grace Hopper/ })
      .click();
    await expect
      .element(screen.getByRole('button', { name: 'Reviewer, Grace Hopper' }))
      .toBeVisible();
    await screen.getByRole('switch', { name: 'Blocking' }).click();
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Invoices fail to download' }))
      .toBeVisible();
    expect(bodyOf(fake, 'POST', '/api/v1/projects/WEB/issues')).toMatchObject({
      properties: {
        // In the order of the options, whatever the order ticked.
        [PLATFORMS.id]: [IOS, ANDROID],
        [REFERENCE.id]: 'CUST-42',
        [ESTIMATE.id]: 2.5,
        [DUE.id]: '2026-11-02',
        [REVIEWER.id]: GRACE.id,
        [BLOCKING.id]: true,
      },
    });
  });

  it('refuse a value its type cannot take, before sending', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    await screen.getByLabelText('Estimate').fill('1e99');
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect.element(screen.getByText('This value does not suit the property.')).toBeVisible();
    await expect.element(screen.getByLabelText('Estimate')).toHaveAttribute('aria-invalid', 'true');
    expect(bodyOf(fake, 'POST', '/api/v1/projects/WEB/issues')).toBeUndefined();
  });

  it('never ask whoever may not assign to name someone', async () => {
    server({ user: GRACE, graceRole: DEFAULT_ROLE_IDS.requester });
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await expect.element(screen.getByLabelText('Estimate')).toBeVisible();
    await expect.element(screen.getByRole('button', { name: /^Reviewer/ })).not.toBeInTheDocument();
  });
});

describe('the properties of an issue', () => {
  it('are changed beside it as their type asks, each sent as stored', async () => {
    const fake = server();
    await renderApp({ path: '/issues/WEB-1' });
    const put = (propertyId: string) =>
      bodyOf(fake, 'PUT', `/api/v1/issues/WEB-1/properties/${propertyId}`);

    await sidebar().getByRole('spinbutton', { name: 'Estimate' }).fill('3');
    await userEvent.keyboard('{Enter}');
    await sidebar().getByRole('textbox', { name: 'Reference' }).fill('CUST-42');
    await userEvent.keyboard('{Enter}');
    await sidebar().getByLabelText('Due').fill('2026-11-02');
    await userEvent.keyboard('{Enter}');
    await sidebar().getByRole('switch', { name: 'Blocking' }).click();
    await sidebar().getByRole('button', { name: 'Platforms, None' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Android' }).click();
    await userEvent.keyboard('{Escape}');
    await sidebar().getByRole('button', { name: 'Reviewer, None' }).click();
    await page
      .getByRole('dialog', { name: 'Reviewer' })
      .getByRole('button', { name: /Grace Hopper/ })
      .click();

    await expect
      .element(sidebar().getByRole('button', { name: 'Reviewer, Grace Hopper' }))
      .toBeVisible();
    await expect.element(sidebar().getByRole('switch', { name: 'Blocking' })).toBeChecked();
    await expect.element(sidebar().getByRole('spinbutton', { name: 'Estimate' })).toHaveValue(3);
    expect(put(ESTIMATE.id)).toStrictEqual({ value: 3 });
    expect(put(REFERENCE.id)).toStrictEqual({ value: 'CUST-42' });
    expect(put(DUE.id)).toStrictEqual({ value: '2026-11-02' });
    expect(put(BLOCKING.id)).toStrictEqual({ value: true });
    expect(put(PLATFORMS.id)).toStrictEqual({ value: [ANDROID] });
    expect(put(REVIEWER.id)).toStrictEqual({ value: GRACE.id });
  });

  it('are taken away, a typed one emptied, a box unticked', async () => {
    const fake = server({ values: { [ESTIMATE.id]: 2, [BLOCKING.id]: true } });
    await renderApp({ path: '/issues/WEB-1' });

    await sidebar().getByRole('spinbutton', { name: 'Estimate' }).fill('');
    await userEvent.keyboard('{Enter}');
    await sidebar().getByRole('switch', { name: 'Blocking' }).click();

    await expect.element(sidebar().getByRole('switch', { name: 'Blocking' })).not.toBeChecked();
    expect(bodyOf(fake, 'PUT', `/api/v1/issues/WEB-1/properties/${ESTIMATE.id}`)).toStrictEqual({
      value: null,
    });
    expect(bodyOf(fake, 'PUT', `/api/v1/issues/WEB-1/properties/${BLOCKING.id}`)).toStrictEqual({
      value: null,
    });
  });

  it('tell each change in the history, in words', async () => {
    const fake = server();
    const at = (minute: number) => `2026-10-22T09:${String(minute).padStart(2, '0')}:00.000Z`;
    const change = (
      minute: number,
      payload: Extract<IssueActivity, { type: 'issue.propertyChanged' }>['payload'],
    ): IssueActivity => ({
      id: `01a1569b-9900-7000-8000-0000000009${String(minute).padStart(2, '0')}`,
      type: 'issue.propertyChanged',
      actor: { id: ADA.id, name: ADA.name },
      createdAt: at(minute),
      payload,
    });
    const named = (property: typeof DUE) => ({ id: property.id, name: property.name });
    fake.state.activities.set('WEB-1', [
      change(10, { type: 'date', property: named(DUE), from: null, to: '2026-11-02' }),
      change(20, { type: 'checkbox', property: named(BLOCKING), from: null, to: true }),
      change(30, {
        type: 'user',
        property: named(REVIEWER),
        from: null,
        to: { id: GRACE.id, name: GRACE.name },
      }),
      change(40, {
        type: 'multiSelect',
        property: named(PLATFORMS),
        from: null,
        to: [
          { id: IOS ?? '', name: 'iOS' },
          { id: ANDROID ?? '', name: 'Android' },
        ],
      }),
      change(50, { type: 'number', property: named(ESTIMATE), from: 2, to: 2.5 }),
      change(55, { type: 'text', property: named(REFERENCE), from: 'CUST-42', to: null }),
    ]);
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    const activity = screen.getByRole('region', { name: 'Activity' });
    await expect.element(activity.getByText(/set Due to “Nov 2, 2026”/)).toBeVisible();
    await expect.element(activity.getByText(/ticked Blocking/)).toBeVisible();
    await expect.element(activity.getByText(/set Reviewer to “Grace Hopper”/)).toBeVisible();
    await expect.element(activity.getByText(/set Platforms to “iOS, Android”/)).toBeVisible();
    await expect.element(activity.getByText(/set Estimate to “2.5”/)).toBeVisible();
    await expect.element(activity.getByText(/cleared Reference/)).toBeVisible();
  });

  it('show in the list with their names, a box ticked by its name alone', async () => {
    server({
      values: { [DUE.id]: '2026-11-02', [REFERENCE.id]: 'CUST-42', [BLOCKING.id]: true },
    });
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    const chips = screen
      .getByRole('row', { name: /Crash on phones/ })
      .getByRole('list', { name: 'Properties' });
    await expect.element(chips.getByText('Due: Nov 2, 2026')).toBeVisible();
    await expect.element(chips.getByText('Reference: CUST-42')).toBeVisible();
    await expect.element(chips.getByText('Blocking', { exact: true })).toBeVisible();
  });
});

describe('the list filtered by property', () => {
  /** Three issues of WEB: two with values, one with none. */
  function listServer() {
    return fakeServer({
      user: ADA,
      properties: [PLATFORMS, REFERENCE, ESTIMATE, DUE, REVIEWER, BLOCKING],
      projects: [fakeProject('WEB', 'Website', { members: [{ userId: ADA.id, roleId: null }] })],
      issues: [
        fakeIssue('WEB', 1, 'Crash on phones', {
          properties: {
            [PLATFORMS.id]: [ANDROID ?? ''],
            [DUE.id]: '2026-11-02',
            [BLOCKING.id]: true,
          },
        }),
        fakeIssue('WEB', 2, 'Slow export', {
          properties: { [PLATFORMS.id]: [IOS ?? ''], [DUE.id]: '2026-10-20' },
        }),
        fakeIssue('WEB', 3, 'Typo on the home page'),
      ],
    });
  }

  const row = (title: string) => page.getByRole('row', { name: new RegExp(title) });

  it('offers the properties a list can be filtered by, the one chosen opening at once', async () => {
    listServer();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await screen.getByRole('button', { name: 'Filter by Property' }).click();
    // A line of text is never filtered.
    await expect
      .element(screen.getByRole('menuitem', { name: 'Reference' }))
      .not.toBeInTheDocument();
    await screen.getByRole('menuitem', { name: 'Platforms' }).click();
    await screen.getByRole('menuitemcheckbox', { name: 'Android' }).click();
    await userEvent.keyboard('{Escape}');

    await expect.element(screen.getByRole('button', { name: 'Platforms: Android' })).toBeVisible();
    await expect.element(row('Crash on phones')).toBeVisible();
    await expect.element(row('Slow export')).not.toBeInTheDocument();
    await expect.element(row('Typo on the home page')).not.toBeInTheDocument();
  });

  it('keeps the boxes ticked, or not', async () => {
    listServer();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await screen.getByRole('button', { name: 'Filter by Property' }).click();
    await screen.getByRole('menuitem', { name: 'Blocking' }).click();
    await screen.getByRole('menuitemradio', { name: 'Not ticked' }).click();

    await expect
      .element(screen.getByRole('button', { name: 'Blocking: Not ticked' }))
      .toBeVisible();
    await expect.element(row('Crash on phones')).not.toBeInTheDocument();
    await expect.element(row('Slow export')).toBeVisible();
  });

  it('keeps the days of a range given in a dialog, then clears it', async () => {
    listServer();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    await screen.getByRole('button', { name: 'Filter by Property' }).click();
    await screen.getByRole('menuitem', { name: 'Due' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Filter by Due' });
    await dialog.getByLabelText('From').fill('2026-11-01');
    await dialog.getByRole('button', { name: 'Apply' }).click();

    await expect.element(dialog).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Due: ≥ Nov 1, 2026' })).toBeVisible();
    await expect.element(row('Crash on phones')).toBeVisible();
    await expect.element(row('Slow export')).not.toBeInTheDocument();

    await screen.getByRole('button', { name: 'Due: ≥ Nov 1, 2026' }).click();
    await screen
      .getByRole('dialog', { name: 'Filter by Due' })
      .getByRole('button', { name: 'Clear' })
      .click();
    await expect.element(row('Slow export')).toBeVisible();
  });

  it('comes back from the address, until the filters are cleared', async () => {
    listServer();
    const { screen } = await renderApp({
      path: `/issues?project=WEB&property=${encodeURIComponent(`${PLATFORMS.id}:${IOS},none`)}`,
    });

    await expect.element(screen.getByRole('button', { name: 'Platforms: iOS +1' })).toBeVisible();
    await expect.element(row('Slow export')).toBeVisible();
    await expect.element(row('Typo on the home page')).toBeVisible();
    await expect.element(row('Crash on phones')).not.toBeInTheDocument();

    await screen.getByRole('button', { name: 'Clear the filters' }).click();
    await expect.element(row('Crash on phones')).toBeVisible();
  });

  it('says so when a filter no longer suits the project', async () => {
    listServer();
    const { screen } = await renderApp({
      path: `/issues?project=WEB&property=${encodeURIComponent(`${REFERENCE.id}:none`)}`,
    });

    await expect
      .element(
        screen.getByText(
          'A filter no longer suits the properties of this project. Clear the filters.',
        ),
      )
      .toBeVisible();
  });
});
