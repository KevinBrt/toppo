import { randomInt } from 'node:crypto';
import { ADMIN } from './admin.ts';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

/** A key no other test has taken: desktop and phone run side by side on one database. */
function uniqueKey(): string {
  return `I${randomInt(36 ** 5)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')}`;
}

test('an issue is reported, moved through the workflow and closed', async ({ page, baseURL }) => {
  const key = uniqueKey();
  const created = await page.request.post('/api/v1/projects', {
    headers: { origin: baseURL ?? '' },
    data: { key, name: `Support ${key}` },
  });
  expect(created.status()).toBe(201);

  await page.goto(`/issues?project=${key}`);
  await expect(page.getByText('No open issues')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'New issue' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'New issue' })).toBeVisible();
  await page.getByLabel('Subject').fill('Invoices fail to download');
  // Written as it reads: the shortcut turns "every" bold, no Markdown mark is typed.
  await page.getByRole('textbox', { name: 'Description' }).click();
  await page.keyboard.type('Since this morning, ');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type('every');
  await page.keyboard.press('ControlOrMeta+b');
  await page.keyboard.type(' invoice fails.');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create the issue' }).click();

  await expect(page).toHaveURL(`/issues/${key}-1`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Invoices fail to download' }),
  ).toBeVisible();
  await expect(page.getByText('every', { exact: true })).toBeVisible();
  await expectAccessible(page);

  // Its reporter follows it, until they stop.
  await page.getByRole('button', { name: 'Unfollow' }).click();
  await expect(page.getByRole('button', { name: 'Follow' })).toHaveAccessibleDescription(
    '0 people follow this issue',
  );
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('button', { name: 'Unfollow' })).toHaveAccessibleDescription(
    '1 person follows this issue',
  );

  // Only the statuses the workflow allows next are offered.
  const status = (name: string) =>
    page
      .getByRole('main')
      .getByRole('button', { name: `Status, ${name}` })
      .first();
  await status('New').click();
  await expect(page.getByRole('menuitemradio', { name: 'Waiting' })).toHaveCount(0);
  await page.getByRole('menuitemradio', { name: 'In progress' }).click();
  await status('In progress').click();
  await page.getByRole('menuitemradio', { name: 'Resolved' }).click();
  await expect(status('Resolved')).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Activity' })
      .getByRole('listitem')
      .first()
      .filter({ hasText: 'changed the status In progress to Resolved' }),
  ).toBeVisible();

  await page.getByRole('main').getByRole('button', { name: 'Assignee, Unassigned' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: new RegExp(ADMIN.name) })
    .click();
  await expect(
    page.getByRole('main').getByRole('button', { name: `Assignee, ${ADMIN.name}` }),
  ).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Breadcrumb' })
    .getByRole('link', { name: 'Issues' })
    .click();
  // Closed now: out of the open issues shown first, among the closed ones.
  await expect(page.getByText('No open issues')).toBeVisible();
  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: 'State: Open' })
    .click();
  await page.getByRole('menuitemradio', { name: 'Closed' }).click();
  await expect(page.getByRole('link', { name: 'Invoices fail to download' })).toBeVisible();
  await expect(
    page.getByRole('main').getByText('Resolved', { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expectAccessible(page);

  // Given to oneself, closed or not, it is among one's issues.
  await page.goto('/my-issues');
  await expect(
    page.getByRole('main').getByText(`${key}-1`, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expectAccessible(page);
});

test('an issue is found by its words, its key, or a filter, the list grouped', async ({
  page,
  baseURL,
}) => {
  const key = uniqueKey();
  const headers = { origin: baseURL ?? '' };
  expect(
    (
      await page.request.post('/api/v1/projects', { headers, data: { key, name: `Find ${key}` } })
    ).status(),
  ).toBe(201);
  const fields: { priorities: { id: string; name: string }[] } = await (
    await page.request.get(`/api/v1/projects/${key}/issue-fields`)
  ).json();
  const urgent = fields.priorities.find(({ name }) => name === 'Urgent');
  if (!urgent) {
    throw new Error('No Urgent priority');
  }
  for (const issue of [
    { title: 'Invoices fail to download' },
    { title: 'Export is empty', priorityId: urgent.id },
    { title: 'Typo on the home page', description: 'The café is misspelled.' },
  ]) {
    expect(
      (
        await page.request.post(`/api/v1/projects/${key}/issues`, { headers, data: issue })
      ).status(),
    ).toBe(201);
  }

  await page.goto(`/issues?project=${key}`);
  const search = page.getByRole('searchbox', { name: 'Search issues' });
  await search.fill('CAFE');
  await expect(page.getByRole('link', { name: 'Export is empty' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Typo on the home page' })).toBeVisible();
  await search.fill(`${key.toLowerCase()}-1`);
  await expect(page.getByRole('link', { name: 'Typo on the home page' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Invoices fail to download' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear the filters' }).click();

  await page
    .getByRole('group', { name: 'Filters' })
    .getByRole('button', { name: 'Priority' })
    .click();
  await page.getByRole('menuitemcheckbox', { name: 'Urgent' }).click();
  await page.keyboard.press('Escape');
  await expectAccessible(page);
  await expect(page.getByRole('link', { name: 'Invoices fail to download' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Export is empty' })).toBeVisible();

  // Kept in the address: shared or reloaded, the list shows the same.
  await page.getByRole('button', { name: 'Group: None' }).click();
  await page.getByRole('menuitemradio', { name: 'Priority' }).click();
  await page.reload();
  await expect(
    page.getByRole('group', { name: 'Filters' }).getByRole('button', { name: 'Priority: Urgent' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Group: Priority' })).toBeVisible();
  await expect(page.getByText('1 issue', { exact: true }).filter({ visible: true })).toBeAttached();
  await expect(page.getByRole('link', { name: 'Export is empty' })).toBeVisible();
  await expectAccessible(page);
});

test('several issues are moved, then deleted, at once from the list', async ({ page, baseURL }) => {
  const key = uniqueKey();
  const headers = { origin: baseURL ?? '' };
  expect(
    (
      await page.request.post('/api/v1/projects', { headers, data: { key, name: `Bulk ${key}` } })
    ).status(),
  ).toBe(201);
  for (const title of ['Invoices fail to download', 'Export is empty', 'Typo on the home page']) {
    expect(
      (
        await page.request.post(`/api/v1/projects/${key}/issues`, { headers, data: { title } })
      ).status(),
    ).toBe(201);
  }

  await page.goto(`/issues?project=${key}`);
  await page.getByRole('checkbox', { name: `Select ${key}-1` }).check();
  await page.getByRole('checkbox', { name: `Select ${key}-2` }).check();
  const bar = page.getByRole('region', { name: 'Selected issues' });
  await expect(bar.getByText('2 selected')).toBeVisible();
  await expectAccessible(page);
  await bar.getByRole('button', { name: 'Status' }).click();
  await page.getByRole('menuitem', { name: 'In progress' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Move 2 issues to “In progress”?' });
  await expectAccessible(page);
  await confirmation.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('2 issues changed.')).toBeVisible();
  await expect(bar).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Select every issue of the page' }).check();
  await bar.getByRole('button', { name: 'Delete' }).click();
  await page
    .getByRole('dialog', { name: 'Delete 3 issues?' })
    .getByRole('button', { name: 'Delete for good' })
    .click();
  await expect(page.getByText('3 issues deleted.')).toBeVisible();
  await expect(page.getByText('No open issues')).toBeVisible();
  await expectAccessible(page);
});
