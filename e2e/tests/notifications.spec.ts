import { randomInt } from 'node:crypto';
import { expect, expectAccessible, test } from './fixtures.ts';

test.use({ locale: 'en-US' });

// Desktop only: accepting an invitation is rate limited, and this journey accepts one.
test('a comment names a teammate with @, and the bell leads to every notification', {
  tag: '@desktop-only',
}, async ({ page, baseURL }) => {
  const suffix = randomInt(36 ** 5)
    .toString(36)
    .toUpperCase()
    .padStart(5, '0');
  const key = `N${suffix}`;
  const teammate = `Mentioned ${suffix}`;
  const headers = { origin: baseURL ?? '' };
  const post = async (url: string, data: object) => {
    const response = await page.request.post(url, { headers, data });
    expect(response.status(), url).toBeLessThan(300);
    return response;
  };

  // A teammate who sees the project's issues, through an accepted invitation.
  await post('/api/v1/projects', { key, name: `Talk ${key}` });
  await post(`/api/v1/projects/${key}/issues`, { title: 'Invoices fail to download' });
  const roles = (await (await page.request.get('/api/v1/roles')).json()) as {
    roles: { id: string; name: string }[];
  };
  const team = roles.roles.find(({ name }) => name === 'Team');
  const invited = (await (
    await post('/api/v1/invitations', {
      emails: [`mentioned-${suffix.toLowerCase()}@example.com`],
      roleId: team?.id,
      projectKeys: [key],
    })
  ).json()) as { invitations: { link: string }[] };
  const token = new URL(invited.invitations[0]?.link ?? '').hash.slice(1);
  await post('/api/v1/invitations/accept', {
    token,
    name: teammate,
    password: 'a long passphrase for the teammate',
  });

  // Named from the comment box: `@` and the start of the name, then Enter.
  await page.goto(`/issues/${key}-1`);
  const activity = page.getByRole('region', { name: 'Activity' });
  const box = activity.getByRole('textbox', { name: 'Add a comment' });
  await box.pressSequentially(`Could you look, @Mentioned ${suffix.slice(0, 3)}`);
  const people = page.getByRole('listbox', { name: 'Mention a user' });
  await expect(people.getByRole('option', { name: `${teammate} Team` })).toBeVisible();
  await expectAccessible(page);
  await box.press('Enter');
  await expect(box).toHaveValue(`Could you look, @${teammate} `);
  await activity.getByRole('button', { name: 'Send' }).click();
  const sent = activity.getByRole('listitem').filter({ hasText: 'Could you look' });
  await expect(sent.getByText(`@${teammate}`, { exact: true })).toBeVisible();
  await expect(box).toHaveValue('');

  // The bell, then the page of every notification, checked by axe: an open menu hides the page
  // behind it from assistive technologies, which axe reports about the buttons it hides.
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await page.getByRole('menu').getByRole('menuitem', { name: 'See all' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
  await expectAccessible(page);
});
