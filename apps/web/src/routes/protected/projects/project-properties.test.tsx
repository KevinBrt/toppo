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
  await page.viewport(1280, 900);
});

const VERSION = fakeProperty(1, 'Version', ['1.2', '1.3']);
const optionOf = (name: string) => VERSION.options.find((option) => option.name === name)?.id ?? '';

/** Ada manages WEB, whose first issue is on version 1.2, and API, whose issue is too. */
function server(user = ADA) {
  return fakeServer({
    user,
    properties: [VERSION],
    projects: [fakeProject('WEB', 'Website'), fakeProject('API', 'Public API')],
    issues: [
      fakeIssue('WEB', 1, 'Crash on phones', { properties: { [VERSION.id]: optionOf('1.2') } }),
      fakeIssue('API', 1, 'Timeout', { properties: { [VERSION.id]: optionOf('1.2') } }),
    ],
  });
}

const panel = () => page.getByRole('dialog');

/** The body of the last request to `path`, as the fake server received it. */
function lastBody(fake: ReturnType<typeof fakeServer>, method: string, path: string): unknown {
  return fake.requests.findLast((request) => request.method === method && request.path === path)
    ?.body;
}

describe('a project’s properties', () => {
  it('hide the priority or require the category, the two never both', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/projects/WEB/properties' });

    await screen.getByRole('switch', { name: 'Hidden in this project, Priority' }).click();
    await expect
      .element(screen.getByRole('switch', { name: 'Hidden in this project, Priority' }))
      .toBeChecked();
    await screen.getByRole('switch', { name: 'Required at creation, Category' }).click();
    await expect
      .element(screen.getByRole('switch', { name: 'Required at creation, Category' }))
      .toBeChecked();
    await screen.getByRole('switch', { name: 'Hidden in this project, Category' }).click();

    await expect
      .element(screen.getByRole('switch', { name: 'Required at creation, Category' }))
      .not.toBeChecked();
    expect(lastBody(fake, 'PUT', '/api/v1/projects/WEB/fields')).toStrictEqual({
      priority: { hidden: true, required: false },
      category: { hidden: true, required: false },
    });
  });

  it('adapt a property of the organization with options of its own', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/projects/WEB/properties' });

    await screen.getByRole('button', { name: /^Version/ }).click();
    await expect.element(panel()).toHaveAccessibleName('Version');
    await panel().getByRole('switch', { name: 'Options of its own' }).click();
    await panel().getByRole('button', { name: 'Remove 1.2' }).click();
    await expect
      .element(panel().getByText('Saving takes an option off 1 issue of this project.'))
      .toBeVisible();
    await panel().getByLabelText('New option').fill('2.0');
    await userEvent.keyboard('{Enter}');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: /^Version Own options 1.3, 2.0/ }))
      .toBeVisible();
    expect(
      lastBody(fake, 'PUT', `/api/v1/projects/WEB/properties/${VERSION.id}/adaptation`),
    ).toMatchObject({
      hidden: false,
      options: {
        options: [{ id: optionOf('1.3'), name: '1.3' }, { name: '2.0' }],
        removed: [optionOf('1.2')],
      },
    });
    // Only this project's issue loses its value.
    expect(fake.state.issues.map(({ properties }) => properties[VERSION.id])).toStrictEqual([
      undefined,
      optionOf('1.2'),
    ]);
  });

  it('hide a property of the organization in the project', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/projects/WEB/properties' });

    await screen.getByRole('button', { name: /^Version/ }).click();
    await panel().getByRole('switch', { name: 'Hidden in this project' }).click();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect
      .element(screen.getByRole('button', { name: /^Version Hidden 1.2, 1.3/ }))
      .toBeVisible();
    expect(fake.state.propertyAdaptations).toStrictEqual([
      { projectKey: 'WEB', propertyId: VERSION.id, hidden: true, options: null },
    ]);
  });

  it('add properties of its own', async () => {
    const fake = server();
    const { screen } = await renderApp({ path: '/projects/WEB/properties' });

    await expect.element(screen.getByText('No property of its own yet.')).toBeVisible();
    await screen.getByRole('button', { name: 'New property' }).click();
    await panel().getByLabelText('Name').fill('Sprint');
    await panel().getByLabelText('New option').fill('Sprint 12');
    await userEvent.keyboard('{Enter}');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    await expect.element(screen.getByRole('button', { name: /^Sprint Sprint 12/ })).toBeVisible();
    expect(lastBody(fake, 'POST', '/api/v1/projects/WEB/properties')).toMatchObject({
      name: 'Sprint',
      options: [{ name: 'Sprint 12' }],
    });
    expect(fake.state.properties.at(-1)).toMatchObject({ name: 'Sprint', projectKey: 'WEB' });
  });

  it('are kept from those who do not manage the project', async () => {
    server(GRACE);
    const { screen } = await renderApp({ path: '/projects/WEB/properties' });

    await expect.element(screen.getByText('You do not have access to this page')).toBeVisible();
    await expect.element(screen.getByRole('switch').first()).not.toBeInTheDocument();
  });
});
