import { randomInt } from 'node:crypto';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

test('an administrator adds a webhook, copies its secret, tests it, then deletes it', async ({
  page,
}) => {
  const name = `Deployments ${randomInt(36 ** 4).toString(36)}`;
  await page.goto('/settings/webhooks');
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible();
  await page.getByRole('link', { name: 'Add a webhook' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Add a webhook' })).toBeVisible();
  await expectAccessible(page);

  await page.getByLabel('Name', { exact: true }).fill(name);
  // An address nobody answers: the journey checks what Toppo shows, not a receiver.
  await page.getByLabel('Address', { exact: true }).fill('https://hooks.example.invalid/toppo');
  await page.getByRole('checkbox', { name: /An issue is created/ }).check();
  await page.getByRole('button', { name: 'Add the webhook' }).click();

  // The secret, 32 random bytes, shown this once.
  const dialog = page.getByRole('dialog', { name: 'Copy its secret now' });
  await expect(dialog.getByLabel('Secret')).toHaveValue(/^whsec_[A-Za-z0-9+/]{43}=$/);
  await expectAccessible(page);
  await dialog.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.getByRole('button', { name: 'Send a test' }).click();
  await expect(page.getByText('Test queued: it shows in the deliveries.')).toBeVisible();
  // Among those of the issues other journeys create meanwhile, which it hears of too.
  const deliveries = page.getByRole('region', { name: 'Latest deliveries' });
  await expect(deliveries.getByRole('row').filter({ hasText: 'webhook.test' })).toHaveCount(1);
  await expectAccessible(page);

  // On a phone's width too, nothing scrolls sideways: the deliveries scroll in their own frame.
  await page.setViewportSize({ width: 320, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow at 320px').toBe(0);

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page
    .getByRole('dialog', { name: `Delete ${name}?` })
    .getByRole('button', { name: 'Delete the webhook' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible();
  await expect(page.getByRole('link', { name })).toHaveCount(0);
});
