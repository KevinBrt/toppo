import { randomInt } from 'node:crypto';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

test('the palette finds an issue of any project and opens it', async ({
  page,
  baseURL,
  isMobile,
}) => {
  // A letter first: PostgreSQL reads "8E0O7" as the number 8e0 and the word o7, so no typo of it
  // would ever be corrected to it.
  const suffix = `${String.fromCharCode(65 + randomInt(26))}${randomInt(36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0')}`;
  const key = `S${suffix}`;
  const headers = { origin: baseURL ?? '' };
  expect(
    (
      await page.request.post('/api/v1/projects', { headers, data: { key, name: `Search ${key}` } })
    ).status(),
  ).toBe(201);
  const title = `Payment page times out ${suffix}`;
  expect(
    (
      await page.request.post(`/api/v1/projects/${key}/issues`, { headers, data: { title } })
    ).status(),
  ).toBe(201);

  await page.goto('/my-issues');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // A finger taps the button; a keyboard has its shortcut.
  if (isMobile) {
    await page.getByRole('button', { name: 'Search' }).click();
  } else {
    await page.keyboard.press('ControlOrMeta+k');
  }
  const search = page.getByRole('combobox', { name: 'Search issues and pages' });
  await expect(search).toBeFocused();
  await expect(page.getByRole('option', { name: 'My issues' })).toBeVisible();

  // A typo in its last letter finds it too.
  await search.fill(`${suffix.slice(0, -1)}${suffix.endsWith('Q') ? 'W' : 'Q'}`.toLowerCase());
  const found = page.getByRole('option', { name: new RegExp(`${key}-1`) });
  await expect(found).toBeVisible();

  await search.fill(suffix.toLowerCase());
  await expect(found).toBeVisible();
  await expect(found).toHaveAttribute('aria-selected', 'true');
  await expectAccessible(page);
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(`/issues/${key}-1`);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
});
