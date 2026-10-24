import { randomInt } from 'node:crypto';
import type { APIRequestContext } from '@playwright/test';
import { expect, expectAccessible, test } from './fixtures.ts';

/**
 * Playwright's trace snapshots read the images a page shows: the preview of a chosen image is a
 * `blob:` address, which the CSP lets the page show but not fetch (`connect-src 'self'`).
 */
const TRACE_SNAPSHOTS = /^Connecting to 'blob:[^']+' violates .*"connect-src 'self'"/;

test.use({ locale: 'en-US', allowedConsoleErrors: [TRACE_SNAPSHOTS] });

/** A real 1×1 image, so that its thumbnail is drawn. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\n%%EOF\n');
const CSV = Buffer.from('Numéro;Montant\n1;12,50\n');

/** A project of its own, so that tests running at once never meet. */
async function newProject(request: APIRequestContext, origin: string): Promise<string> {
  const key = `F${randomInt(36 ** 5)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0')}`;
  const created = await request.post('/api/v1/projects', {
    headers: { origin },
    data: { key, name: `Files ${key}` },
  });
  expect(created.status()).toBe(201);
  return key;
}

test('files chosen with a new issue are attached, shown, downloaded, then removed', async ({
  page,
  baseURL,
}) => {
  const key = await newProject(page.request, baseURL ?? '');
  await page.goto(`/issues/new?project=${key}`);
  await page.getByLabel('Subject').fill('Invoices fail to download');
  const zone = page.getByRole('group', { name: 'Attachments' });
  await expect(zone.getByText(/20\sMB maximum per file$/)).toBeVisible();
  await zone.locator('input[type=file]').setInputFiles([
    { name: 'capture-erreur.png', mimeType: 'image/png', buffer: PNG },
    { name: 'facture-octobre.pdf', mimeType: 'application/pdf', buffer: PDF },
    { name: 'export-commandes.csv', mimeType: 'text/csv', buffer: CSV },
  ]);
  await expect(zone.getByRole('button', { name: 'Remove facture-octobre.pdf' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Create the issue' }).click();

  await expect(page).toHaveURL(new RegExp(`/issues/${key}-1$`));
  const request = page.getByRole('region', { name: 'Request' });
  await expect(request.getByText('3 attachments')).toBeVisible();
  // The thumbnail is the image itself, served inline under the strict CSP.
  const image = request.getByRole('button', { name: /^View capture-erreur\.png/ });
  await expect
    .poll(() => image.locator('img').evaluate((shown: HTMLImageElement) => shown.naturalWidth))
    .toBe(1);
  const pdf = request.getByRole('link', { name: /^Open facture-octobre\.pdf/ });
  await expect(pdf.locator('img')).toHaveCount(0);
  await expectAccessible(page);

  // An image and a text are shown in the app, one after the other.
  await image.click();
  const viewer = page.getByRole('dialog', { name: 'capture-erreur.png' });
  await expect
    .poll(() =>
      viewer
        .getByRole('img', { name: 'capture-erreur.png' })
        .evaluate((shown: HTMLImageElement) => shown.naturalWidth),
    )
    .toBe(1);
  await expectAccessible(page);
  await viewer.getByRole('button', { name: 'Next file' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'export-commandes.csv' })
      .getByRole('textbox', { name: 'Content of export-commandes.csv' }),
  ).toHaveValue('Numéro;Montant\n1;12,50\n');
  await page.keyboard.press('Escape');

  // A PDF opens in the browser's own viewer, in a tab of its own, sandboxed all the same.
  await expect(pdf).toHaveAttribute('target', '_blank');
  const shownPdf = await page.request.get((await pdf.getAttribute('href')) ?? '');
  expect(shownPdf.status()).toBe(200);
  expect(shownPdf.headers()).toMatchObject({
    'content-type': 'application/pdf',
    'content-disposition': expect.stringMatching(/^inline; filename="facture-octobre\.pdf"/),
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff',
  });

  const csv = request.getByRole('link', { name: 'Download export-commandes.csv' });
  const [download] = await Promise.all([page.waitForEvent('download'), csv.click()]);
  expect(download.suggestedFilename()).toBe('export-commandes.csv');
  const sent = await page.request.get((await csv.getAttribute('href')) ?? '');
  expect(sent.status()).toBe(200);
  expect(await sent.body()).toStrictEqual(CSV);
  expect(sent.headers()).toMatchObject({
    'content-type': 'text/csv',
    'content-disposition': expect.stringMatching(/^attachment; filename="export-commandes\.csv"/),
    'content-security-policy': "default-src 'none'; sandbox",
    'x-content-type-options': 'nosniff',
  });

  await request.getByRole('button', { name: 'Remove export-commandes.csv' }).click();
  const dialog = page.getByRole('dialog', { name: 'Remove this file?' });
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Remove the file' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(request.getByText('2 attachments')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Activity' })).toContainText(
    'attached facture-octobre.pdf',
  );
});

test.describe('a file that is not what its name says', () => {
  // The browser logs the refusal it receives. One pattern only: Playwright reads a second item
  // of the list as the options of the fixture.
  test.use({ allowedConsoleErrors: [new RegExp(`${TRACE_SNAPSHOTS.source}|status of 415`)] });

  test('is refused, saying why, the others attached', async ({ page, baseURL }) => {
    const key = await newProject(page.request, baseURL ?? '');
    const created = await page.request.post(`/api/v1/projects/${key}/issues`, {
      headers: { origin: baseURL ?? '' },
      data: { title: 'Empty CSV export' },
    });
    expect(created.status()).toBe(201);

    await page.goto(`/issues/${key}-1`);
    const request = page.getByRole('region', { name: 'Request' });
    await expect(request.getByRole('button', { name: 'Attach files' })).toBeEnabled();
    await request.locator('input[type=file]').setInputFiles([
      {
        name: 'capture.png',
        mimeType: 'image/png',
        buffer: Buffer.from('<!doctype html><script>alert(document.cookie)</script>'),
      },
      { name: 'export.csv', mimeType: 'text/csv', buffer: CSV },
    ]);

    await expect(request.getByRole('alert')).toContainText(
      'capture.png: Its content is not what its extension says.',
    );
    await expect(request.getByText('1 attachment')).toBeVisible();
    await expectAccessible(page);
  });
});

test('a comment is sent with its file, shown with it', async ({ page, baseURL }) => {
  const key = await newProject(page.request, baseURL ?? '');
  const created = await page.request.post(`/api/v1/projects/${key}/issues`, {
    headers: { origin: baseURL ?? '' },
    data: { title: 'Export fails' },
  });
  expect(created.status()).toBe(201);

  await page.goto(`/issues/${key}-1`);
  const activity = page.getByRole('region', { name: 'Activity' });
  await activity.getByRole('textbox', { name: 'Add a comment' }).fill('Here is the log.');
  // Files are taken once the size limit is known, as the paperclip says by being enabled.
  await expect(activity.getByRole('button', { name: 'Attach files' })).toBeEnabled();
  await activity
    .locator('input[type=file]')
    .setInputFiles({ name: 'trace.log', mimeType: 'text/plain', buffer: Buffer.from('ERROR\n') });
  await activity.getByRole('button', { name: 'Send' }).click();

  const comment = activity.getByRole('listitem').filter({ hasText: 'Here is the log.' });
  await expect(comment.getByRole('link', { name: /^Download trace\.log/ })).toBeVisible();
  await expectAccessible(page);
});
