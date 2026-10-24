import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import {
  ADA,
  fakeIssue,
  fakeProperty,
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

/** The body of the last request to `path`, as the fake server received it. */
function lastBody(fake: ReturnType<typeof fakeServer>, method: string, path: string): unknown {
  return fake.requests.findLast((request) => request.method === method && request.path === path)
    ?.body;
}

const panel = () => page.getByRole('dialog');
const option = (position: number) => panel().getByRole('textbox', { name: `Option ${position}` });

describe('the issue properties', () => {
  it('list Priority and Category with their options, highest priority first', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Issue properties' }))
      .toBeVisible();
    await expect
      .element(
        screen.getByRole('button', { name: /Priority 4 options · Urgent, High, Normal, Low/ }),
      )
      .toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /Category 3 options · Bug, Request, Question/ }))
      .toBeVisible();
  });

  it('are kept from those who do not manage the settings', async () => {
    fakeServer({ user: GRACE });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await expect
      .element(screen.getByRole('heading', { name: 'You do not have access to this page' }))
      .toBeVisible();
    await expect.element(screen.getByRole('button', { name: /Category/ })).not.toBeInTheDocument();
  });
});

describe('the categories', () => {
  it('are renamed, recolored, added to and given a default, then saved at once', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: /Category/ }).click();
    await expect.element(panel()).toHaveAccessibleName('Category');
    await option(1).fill('Defect');
    await panel().getByRole('button', { name: 'Color of Request: Gray' }).click();
    await screen.getByRole('menuitemradio', { name: 'Pink' }).click();
    await panel().getByRole('textbox', { name: 'New option' }).fill('Incident');
    await userEvent.keyboard('{Enter}');
    await panel().getByRole('combobox', { name: 'Default' }).selectOptions('Incident');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(lastBody(fake, 'PUT', '/api/v1/categories')).toStrictEqual({
      categories: [
        {
          id: '01a16286-f098-7e89-95b4-e2b2aa971d11',
          name: 'Defect',
          color: 'gray',
          isDefault: false,
        },
        {
          id: '01a16286-f098-7eba-93de-76873ba83fec',
          name: 'Request',
          color: 'pink',
          isDefault: false,
        },
        {
          id: '01a16286-f098-7082-a99d-9636cf947dea',
          name: 'Question',
          color: 'gray',
          isDefault: false,
        },
        { name: 'Incident', color: 'blue', isDefault: true },
      ],
      removed: [],
    });
    await expect
      .element(
        screen.getByRole('button', { name: /4 options · Defect, Request, Question, Incident/ }),
      )
      .toBeVisible();
  });

  it('are put in order by dragging a handle, with the keyboard too', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });
    await screen.getByRole('button', { name: /Category/ }).click();

    const handle = panel().getByRole('button', { name: 'Move Question' });
    await expect.element(handle).toBeVisible();
    handle.element().focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    await expect.element(option(1)).toHaveValue('Question');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(
      (
        lastBody(fake, 'PUT', '/api/v1/categories') as { categories: { name: string }[] }
      ).categories.map(({ name }) => name),
    ).toStrictEqual(['Question', 'Bug', 'Request']);
  });

  it('remove one no issue has, and keep one that issues have, saying how many do', async () => {
    const fake = fakeServer({ user: ADA, issues: [fakeIssue('WEB', 1, 'Broken link')] });
    const { screen } = await renderApp({ path: '/settings/properties' });
    await screen.getByRole('button', { name: /Category/ }).click();

    await expect.element(panel().getByRole('button', { name: 'Remove Request' })).toBeDisabled();
    await expect.element(panel().getByText('1 issue', { exact: true })).toBeVisible();
    await panel().getByRole('button', { name: 'Remove Question' }).click();
    await expect.element(option(3)).not.toBeInTheDocument();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(lastBody(fake, 'PUT', '/api/v1/categories')).toMatchObject({
      removed: ['01a16286-f098-7082-a99d-9636cf947dea'],
    });
    await expect
      .element(screen.getByRole('button', { name: /2 options · Bug, Request/ }))
      .toBeVisible();
  });

  it('point at a name another option has, without saving', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });
    await screen.getByRole('button', { name: /Category/ }).click();

    await option(3).fill('bug');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(option(3)).toHaveAttribute('aria-invalid', 'true');
    await expect.element(option(3)).toHaveAccessibleDescription('Another option has this name.');
    expect(lastBody(fake, 'PUT', '/api/v1/categories')).toBeUndefined();
  });

  it('say so when someone changed them meanwhile', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });
    await screen.getByRole('button', { name: /Category/ }).click();
    fake.state.categories = fake.state.categories.slice(0, 2);

    await panel().getByRole('button', { name: 'Save' }).click();

    await expect
      .element(panel().getByRole('alert'))
      .toHaveTextContent(
        'Someone changed these options meanwhile. Close the panel and open it again.',
      );
  });
});

describe('the priorities', () => {
  it('are renamed and given a default, their four levels staying', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: /Priority/ }).click();
    await expect.element(panel()).toHaveAccessibleName('Priority');
    await expect.element(option(1)).toHaveValue('Urgent');
    await option(2).fill('Important');
    await panel().getByRole('combobox', { name: 'Default' }).selectOptions('Urgent');
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(
      (
        lastBody(fake, 'PUT', '/api/v1/priorities') as {
          priorities: { name: string; isDefault: boolean }[];
        }
      ).priorities.map(({ name, isDefault }) => [name, isDefault]),
    ).toStrictEqual([
      ['Urgent', true],
      ['Important', false],
      ['Normal', false],
      ['Low', false],
    ]);
    await expect
      .element(screen.getByRole('button', { name: /4 options · Urgent, Important, Normal, Low/ }))
      .toBeVisible();
  });
});

describe('the properties admins add', () => {
  const VERSION = fakeProperty(1, 'Version', ['1.2', '1.3']);

  it('are created with their options and settings, then listed', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: 'New property' }).click();
    await expect.element(panel()).toHaveAccessibleName('New property');
    await panel().getByLabelText('Name').fill('Version');
    for (const name of ['1.2', '1.3']) {
      await panel().getByLabelText('New option').fill(name);
      await userEvent.keyboard('{Enter}');
    }
    await expect.element(panel().getByRole('switch', { name: 'Required' })).toBeDisabled();
    await panel().getByRole('switch', { name: 'Asked when an issue is reported' }).click();
    await panel().getByRole('switch', { name: 'Required' }).click();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('button', { name: /Version 2 options · 1.2, 1.3/ }))
      .toBeVisible();
    expect(lastBody(fake, 'POST', '/api/v1/properties')).toMatchObject({
      name: 'Version',
      type: 'list',
      shownInList: false,
      askedAtCreation: true,
      required: true,
      options: [{ name: '1.2' }, { name: '1.3' }],
    });
  });

  it('are of a type chosen once, without options unless a list', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: 'New property' }).click();
    await panel().getByLabelText('Name').fill('Due');
    await panel().getByRole('radio', { name: 'Date' }).click();
    await expect.element(panel().getByText('A day of the calendar.')).toBeVisible();
    await expect.element(panel().getByLabelText('New option')).not.toBeInTheDocument();
    await panel().getByRole('switch', { name: 'Shown in the issue list' }).click();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(lastBody(fake, 'POST', '/api/v1/properties')).toStrictEqual({
      name: 'Due',
      type: 'date',
      shownInList: true,
      askedAtCreation: false,
      required: false,
      options: [],
    });
    await screen.getByRole('button', { name: /^Due A day of the calendar\. Date/ }).click();
    await expect
      .element(panel().getByText('A property keeps its type: create another one to change it.'))
      .toBeVisible();
    await expect.element(panel().getByRole('radio', { name: 'List' })).not.toBeInTheDocument();
  });

  it('never require a checkbox', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: 'New property' }).click();
    await panel().getByRole('switch', { name: 'Asked when an issue is reported' }).click();
    await panel().getByRole('switch', { name: 'Required' }).click();
    await panel().getByRole('radio', { name: 'Checkbox' }).click();

    await expect.element(panel().getByRole('switch', { name: 'Required' })).not.toBeChecked();
    await expect.element(panel().getByRole('switch', { name: 'Required' })).toBeDisabled();
  });

  it('ask for a name and an option before saving', async () => {
    const fake = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: 'New property' }).click();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel().getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    await expect.element(panel().getByText('Add at least one option.')).toBeVisible();
    expect(lastBody(fake, 'POST', '/api/v1/properties')).toBeUndefined();
  });

  it('say how many issues lose an option removed, then save the list whole', async () => {
    const fake = fakeServer({
      user: ADA,
      properties: [VERSION],
      issues: [
        fakeIssue('WEB', 1, 'Crash', {
          properties: { [VERSION.id]: VERSION.options[0]?.id ?? '' },
        }),
      ],
    });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: /^Version/ }).click();
    await panel().getByRole('button', { name: 'Remove 1.2' }).click();
    await expect
      .element(panel().getByText('Saving takes the options you removed off 1 issue.'))
      .toBeVisible();
    await panel().getByRole('button', { name: 'Save' }).click();

    await expect.element(panel()).not.toBeInTheDocument();
    expect(lastBody(fake, 'PUT', `/api/v1/properties/${VERSION.id}`)).toMatchObject({
      options: [{ id: VERSION.options[1]?.id, name: '1.3' }],
      removed: [VERSION.options[0]?.id],
    });
  });

  it('are deleted after asking', async () => {
    const fake = fakeServer({ user: ADA, properties: [VERSION] });
    const { screen } = await renderApp({ path: '/settings/properties' });

    await screen.getByRole('button', { name: /^Version/ }).click();
    await panel().getByRole('button', { name: 'Delete the property' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Version?' });
    await expect.element(dialog.getByText('No issue has a value of it yet.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete the property' }).click();

    await expect.element(screen.getByRole('button', { name: /^Version/ })).not.toBeInTheDocument();
    expect(fake.state.properties).toStrictEqual([]);
  });
});
