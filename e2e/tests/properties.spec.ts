import { randomInt } from 'node:crypto';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

// Categories are one list for the whole instance, its default given to every new issue: changed
// alone, once the other tests are done.
test('an administrator adds a category, new issues get it by default, then removes it', {
  tag: '@instance',
}, async ({ page, baseURL }) => {
  const suffix = randomInt(36 ** 5)
    .toString(36)
    .toUpperCase();
  const name = `Incident ${suffix}`;
  await page.goto('/settings/properties');
  await expect(page.getByRole('heading', { level: 1, name: 'Issue properties' })).toBeVisible();
  await expectAccessible(page);

  await page.getByRole('button', { name: /^Category/ }).click();
  const panel = page.getByRole('dialog', { name: 'Category' });
  await panel.getByRole('textbox', { name: 'New option' }).fill(name);
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Default' }).selectOption(name);
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(`^Category .*${name}`) })).toBeVisible();

  const key = `P${suffix}`;
  const created = await page.request.post('/api/v1/projects', {
    headers: { origin: baseURL ?? '' },
    data: { key, name: `Properties ${key}` },
  });
  expect(created.status()).toBe(201);
  await page.goto(`/issues/new?project=${key}`);
  await expect(page.getByRole('radio', { name })).toBeChecked();

  // Back as it was: Request for new issues, the category gone, no issue having it.
  await page.goto('/settings/properties');
  await page.getByRole('button', { name: /^Category/ }).click();
  await panel.getByRole('combobox', { name: 'Default' }).selectOption('Request');
  await panel.getByRole('button', { name: `Remove ${name}` }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: new RegExp(name) })).toHaveCount(0);
});

test('on phones, a property opens over the whole screen', {
  tag: '@mobile-only',
}, async ({ page }) => {
  await page.goto('/settings/properties');

  await page.getByRole('button', { name: /^Priority/ }).click();
  const panel = page.getByRole('dialog', { name: 'Priority' });
  await expect(panel.getByRole('textbox', { name: 'Option 1' })).toHaveValue('Urgent');
  // Within a pixel: the phone's scale factor rounds it.
  expect((await panel.boundingBox())?.width).toBeCloseTo(page.viewportSize()?.width ?? 0, 0);
  await expectAccessible(page);

  await panel.getByRole('button', { name: 'Cancel' }).click();
  await expect(panel).toHaveCount(0);
});

// A required property is asked of every new issue, in every project: added alone, once the other
// tests are done, then deleted.
test('an administrator adds a property, issues take it at creation and beside them, then it goes', {
  tag: '@instance',
}, async ({ page, baseURL }) => {
  const suffix = randomInt(36 ** 5)
    .toString(36)
    .toUpperCase();
  const name = `Version ${suffix}`;
  await page.goto('/settings/properties');
  await page.getByRole('button', { name: 'New property' }).click();
  const panel = page.getByRole('dialog', { name: 'New property' });
  await panel.getByRole('textbox', { name: 'Name' }).fill(name);
  for (const option of ['1.2', '1.3']) {
    await panel.getByRole('textbox', { name: 'New option' }).fill(option);
    await panel.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await panel.getByRole('switch', { name: 'Shown in the issue list' }).click();
  await panel.getByRole('switch', { name: 'Asked when an issue is reported' }).click();
  await panel.getByRole('switch', { name: 'Required' }).click();
  await expectAccessible(page);
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel).toHaveCount(0);

  const key = `Q${suffix}`;
  const created = await page.request.post('/api/v1/projects', {
    headers: { origin: baseURL ?? '' },
    data: { key, name: `Versions ${key}` },
  });
  expect(created.status()).toBe(201);
  await page.goto(`/issues/new?project=${key}`);
  await page.getByRole('textbox', { name: 'Subject' }).fill('Invoices fail to download');
  await page.getByRole('combobox', { name }).selectOption('1.3');
  await page.getByRole('button', { name: 'Create the issue' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Properties' });
  await expect(sidebar.getByRole('button', { name: `${name}, 1.3` })).toBeVisible();

  await sidebar.getByRole('button', { name: `${name}, 1.3` }).click();
  await page.getByRole('menuitemradio', { name: '1.2' }).click();
  await expect(sidebar.getByRole('button', { name: `${name}, 1.2` })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Activity' }).getByText(`set ${name} to “1.2”`),
  ).toBeVisible();
  await expectAccessible(page);

  // Gone: its value leaves the issue, which keeps it in its history.
  await page.goto('/settings/properties');
  await page.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await page
    .getByRole('dialog', { name })
    .getByRole('button', { name: 'Delete the property' })
    .click();
  await page
    .getByRole('dialog', { name: `Delete ${name}?` })
    .getByRole('button', { name: 'Delete the property' })
    .click();
  await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toHaveCount(0);
});

test('a project adds a date and a checkbox, an issue takes them, the list shows them', async ({
  page,
  baseURL,
}) => {
  const suffix = randomInt(36 ** 5)
    .toString(36)
    .toUpperCase();
  const key = `T${suffix}`;
  const created = await page.request.post('/api/v1/projects', {
    headers: { origin: baseURL ?? '' },
    data: { key, name: `Types ${key}` },
  });
  expect(created.status()).toBe(201);
  await page.goto(`/projects/${key}/properties`);
  for (const [name, type, asked] of [
    ['Due', 'Date', true],
    ['Blocking', 'Checkbox', false],
  ] as const) {
    await page.getByRole('button', { name: 'New property' }).click();
    const panel = page.getByRole('dialog', { name: 'New property' });
    await panel.getByRole('textbox', { name: 'Name' }).fill(name);
    await panel.getByRole('radio', { name: type }).check();
    await expect(panel.getByRole('textbox', { name: 'New option' })).toHaveCount(0);
    await panel.getByRole('switch', { name: 'Shown in the issue list' }).click();
    if (asked) {
      await panel.getByRole('switch', { name: 'Asked when an issue is reported' }).click();
    }
    await expectAccessible(page);
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel).toHaveCount(0);
  }

  await page.goto(`/issues/new?project=${key}`);
  await page.getByRole('textbox', { name: 'Subject' }).fill('Renew the certificates');
  await page.getByLabel('Due').fill('2026-11-02');
  await page.getByRole('button', { name: 'Create the issue' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Properties' });
  await expect(sidebar.getByLabel('Due')).toHaveValue('2026-11-02');
  await sidebar.getByRole('switch', { name: 'Blocking' }).click();
  await expect(
    page.getByRole('region', { name: 'Activity' }).getByText('ticked Blocking'),
  ).toBeVisible();
  await expectAccessible(page);

  await page.goto(`/issues?project=${key}`);
  const chips = page.getByRole('list', { name: 'Properties' }).first();
  await expect(chips.getByText('Due: Nov 2, 2026')).toBeVisible();
  await expect(chips.getByText('Blocking', { exact: true })).toBeVisible();

  // Filtered by a range of days: none after its due day, then the filters cleared.
  await page.getByRole('button', { name: 'Filter by Property' }).click();
  await page.getByRole('menuitem', { name: 'Due' }).click();
  const range = page.getByRole('dialog', { name: 'Filter by Due' });
  await range.getByLabel('From').fill('2026-11-03');
  await expectAccessible(page);
  await range.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('No issue matches')).toBeVisible();
  await expect(page).toHaveURL(/property=/);
  await page.getByRole('button', { name: 'Clear the filters' }).click();
  await expect(chips.getByText('Due: Nov 2, 2026')).toBeVisible();
});

test('a project requires the category and adds a property of its own, asked of its new issues', async ({
  page,
  baseURL,
}) => {
  const suffix = randomInt(36 ** 5)
    .toString(36)
    .toUpperCase();
  const key = `R${suffix}`;
  const created = await page.request.post('/api/v1/projects', {
    headers: { origin: baseURL ?? '' },
    data: { key, name: `Sprints ${key}` },
  });
  expect(created.status()).toBe(201);
  await page.goto(`/projects/${key}/properties`);
  await expect(page.getByRole('heading', { level: 1, name: 'Issue properties' })).toBeVisible();
  await page.getByRole('switch', { name: 'Required at creation, Category' }).click();
  await expect(page.getByRole('switch', { name: 'Required at creation, Category' })).toBeChecked();
  await expectAccessible(page);

  await page.getByRole('button', { name: 'New property' }).click();
  const panel = page.getByRole('dialog', { name: 'New property' });
  await panel.getByRole('textbox', { name: 'Name' }).fill('Sprint');
  await panel.getByRole('textbox', { name: 'New option' }).fill('Sprint 12');
  await panel.getByRole('button', { name: 'Add', exact: true }).click();
  await panel.getByRole('switch', { name: 'Asked when an issue is reported' }).click();
  await panel.getByRole('button', { name: 'Save' }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Sprint Sprint 12/ })).toBeVisible();

  await page.goto(`/issues/new?project=${key}`);
  await page.getByRole('textbox', { name: 'Subject' }).fill('Plan the next sprint');
  await expect(page.getByRole('radio', { name: 'Request' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Create the issue' }).click();
  await expect(page.getByText('Choose a value: it is required.')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('radio', { name: 'Bug' }).check();
  await page.getByRole('combobox', { name: 'Sprint' }).selectOption('Sprint 12');
  await page.getByRole('button', { name: 'Create the issue' }).click();

  const sidebar = page.getByRole('complementary', { name: 'Properties' });
  await expect(sidebar.getByRole('button', { name: 'Sprint, Sprint 12' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Category, Bug' })).toBeVisible();
});
