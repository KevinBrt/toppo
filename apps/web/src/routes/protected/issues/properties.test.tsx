import { DEFAULT_CATEGORIES, DEFAULT_PRIORITIES } from '@toppo/core';
import type { ProjectFields } from '@toppo/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  defaultField,
  fakeIssue,
  fakeProject,
  fakeProperty,
  fakeServer,
  renderApp,
} from '../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

/** Asked at creation and required. */
const VERSION = fakeProperty(1, 'Version', ['1.2', '1.3'], {
  askedAtCreation: true,
  required: true,
});
/** Shown in the list, never asked. */
const TEAM = fakeProperty(2, 'Team', ['Web', 'API'], { shownInList: true });
const optionOf = (property: typeof VERSION, name: string) =>
  property.options.find((option) => option.name === name)?.id ?? '';

const AS_THEY_ARE: ProjectFields = {
  category: { hidden: false, required: false },
  priority: { hidden: false, required: false },
};

/** WEB-1 on version 1.2, for the Web team, in a project taking the fields as `adapted` says. */
function server(adapted: { fields?: ProjectFields; hiddenProperties?: string[] } = {}) {
  return fakeServer({
    user: ADA,
    properties: [VERSION, TEAM],
    projects: [
      fakeProject('WEB', 'Website', {
        members: [{ userId: ADA.id, roleId: null }],
        fieldSettings: adapted.fields ?? AS_THEY_ARE,
      }),
    ],
    propertyAdaptations: (adapted.hiddenProperties ?? []).map((propertyId) => ({
      projectKey: 'WEB',
      propertyId,
      hidden: true,
      options: null,
    })),
    issues: [
      fakeIssue('WEB', 1, 'Crash on phones', {
        properties: { [VERSION.id]: optionOf(VERSION, '1.2'), [TEAM.id]: optionOf(TEAM, 'Web') },
      }),
    ],
  });
}

const sidebar = () => page.getByRole('complementary', { name: 'Properties' });

describe('the properties of a new issue', () => {
  it('are asked when asked at creation, those required before sending', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    await expect.element(screen.getByLabelText('Team')).not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Create the issue' }).click();
    await expect.element(screen.getByText('Choose a value: it is required.')).toBeVisible();
    expect(fake.requests.some(({ method }) => method === 'POST')).toBe(false);

    await screen.getByLabelText('Version').selectOptions('1.3');
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Invoices fail to download' }))
      .toBeVisible();
    expect(fake.requests.find(({ method }) => method === 'POST')?.body).toMatchObject({
      properties: { [VERSION.id]: optionOf(VERSION, '1.3') },
    });
  });
});

describe('the properties of an issue', () => {
  it('are changed beside it, each change in its history', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/issues/WEB-1' });

    await sidebar().getByRole('button', { name: 'Version, 1.2' }).click();
    await screen.getByRole('menuitemradio', { name: '1.3' }).click();
    await sidebar().getByRole('button', { name: 'Team, Web' }).click();
    await screen.getByRole('menuitemradio', { name: 'None' }).click();

    await expect.element(sidebar().getByRole('button', { name: 'Version, 1.3' })).toBeVisible();
    await expect.element(sidebar().getByRole('button', { name: 'Team, None' })).toBeVisible();
    expect(fake.requests).toContainEqual({
      method: 'PUT',
      path: `/api/v1/issues/WEB-1/properties/${VERSION.id}`,
      body: { value: optionOf(VERSION, '1.3') },
    });
    const activity = screen.getByRole('region', { name: 'Activity' });
    await expect.element(activity.getByText(/cleared Team/)).toBeVisible();
    await expect.element(activity.getByText(/set Version to “1.3”/)).toBeVisible();
  });

  it('show in the lists when shown in them, beside the subject, at every width', async () => {
    server();
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    const row = screen.getByRole('row', { name: /Crash on phones/ });
    const chips = row.getByRole('list', { name: 'Properties' });
    await expect.element(chips.getByText('Web', { exact: true })).toBeVisible();
    // Read with its property's name.
    await expect.element(chips.getByText('Team:', { exact: true })).toBeInTheDocument();
    await expect.element(row.getByText('1.2')).not.toBeInTheDocument();

    await page.viewport(375, 800);
    await expect
      .element(screen.getByRole('list', { name: 'Properties' }).getByText('Web'))
      .toBeVisible();
  });
});

describe('the fields a project adapts', () => {
  it('ask for the category it requires, leaving out what it hides', async () => {
    const fake = server({
      fields: {
        category: { hidden: false, required: true },
        priority: { hidden: true, required: false },
      },
      hiddenProperties: [VERSION.id],
    });
    const { screen } = await renderApp({ path: '/issues/new?project=WEB' });

    await screen.getByLabelText('Subject').fill('Invoices fail to download');
    await expect.element(screen.getByRole('radio', { name: 'Request' })).not.toBeChecked();
    await expect.element(screen.getByLabelText('Priority')).not.toBeInTheDocument();
    await expect.element(screen.getByLabelText('Version')).not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Create the issue' }).click();
    await expect.element(screen.getByText('Choose a value: it is required.')).toBeVisible();
    expect(fake.requests.some(({ method }) => method === 'POST')).toBe(false);

    await screen.getByRole('radio', { name: 'Bug' }).click();
    await expect
      .element(screen.getByText('Choose a value: it is required.'))
      .not.toBeInTheDocument();
    await screen.getByRole('button', { name: 'Create the issue' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Invoices fail to download' }))
      .toBeVisible();
    // Hidden, the priority keeps its default.
    expect(fake.requests.find(({ method }) => method === 'POST')?.body).toMatchObject({
      categoryId: defaultField(DEFAULT_CATEGORIES, 'bug').id,
      priorityId: defaultField(DEFAULT_PRIORITIES, 'normal').id,
    });
  });

  it('leave out of an issue what the project hides', async () => {
    server({
      fields: {
        category: { hidden: true, required: false },
        priority: { hidden: true, required: false },
      },
      hiddenProperties: [TEAM.id],
    });
    await renderApp({ path: '/issues/WEB-1' });

    await expect.element(sidebar().getByRole('button', { name: 'Version, 1.2' })).toBeVisible();
    await expect
      .element(sidebar().getByRole('button', { name: /^(Priority|Category|Team),/ }))
      .not.toBeInTheDocument();
  });

  it('leave out of the list what the project hides', async () => {
    server({
      fields: { ...AS_THEY_ARE, priority: { hidden: true, required: false } },
      hiddenProperties: [TEAM.id],
    });
    const { screen } = await renderApp({ path: '/issues?project=WEB' });

    const row = screen.getByRole('row', { name: /Crash on phones/ });
    await expect.element(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    await expect
      .element(screen.getByRole('columnheader', { name: 'Priority' }))
      .not.toBeInTheDocument();
    await expect.element(row.getByText('Web', { exact: true })).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: 'Category' })).toBeVisible();
    await expect.element(screen.getByRole('button', { name: 'Priority' })).not.toBeInTheDocument();
  });
});
