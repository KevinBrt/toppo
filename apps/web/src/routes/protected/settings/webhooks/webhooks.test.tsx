import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import {
  ADA,
  type FakeWebhook,
  fakeDelivery,
  fakeProject,
  fakeServer,
  fakeWebhook,
  GRACE,
  renderApp,
} from '../../../../test-helpers.tsx';

beforeEach(async () => {
  await page.viewport(1280, 800);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const DEPLOYS = fakeWebhook('Deployments', {
  url: 'https://deploy.example.com/hooks/toppo',
  events: ['issue.created', 'issue.statusChanged'],
});

async function openWebhook(webhook: FakeWebhook, more: Parameters<typeof fakeServer>[0] = {}) {
  const server = fakeServer({ user: ADA, webhooks: [webhook], ...more });
  const rendered = await renderApp({ path: `/settings/webhooks/${webhook.id}` });
  await expect
    .element(rendered.screen.getByRole('heading', { level: 1, name: webhook.name }))
    .toBeVisible();
  return { server, ...rendered };
}

describe('the list of webhooks', () => {
  it('shows each webhook with its address, events and state, and opens its page', async () => {
    fakeServer({
      user: ADA,
      webhooks: [
        DEPLOYS,
        fakeWebhook('Chat', { enabled: false }),
        fakeWebhook('Audit', { enabled: false, failures: 10, lastError: 'TIMEOUT' }),
      ],
    });
    const { screen } = await renderApp({ path: '/settings/webhooks' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('link', { name: 'Webhooks' }),
      )
      .toHaveAttribute('aria-current', 'page');
    const rows = screen.getByRole('list', { name: 'Webhooks' }).getByRole('listitem');
    await expect
      .element(rows.nth(0))
      .toHaveTextContent('Audithttps://hooks.example.com/toppo1 eventStopped after failures');
    await expect.element(rows.nth(1)).toMatchTextContent(/^Chat.*Disabled$/);
    await expect
      .element(rows.nth(2))
      .toHaveTextContent('Deploymentshttps://deploy.example.com/hooks/toppo2 eventsEnabled');

    await screen.getByRole('link', { name: 'Deployments' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Deployments' }))
      .toBeVisible();
  });

  it('says when there is none', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/webhooks' });

    await expect
      .element(screen.getByRole('heading', { level: 2, name: 'No webhook yet' }))
      .toBeVisible();
  });

  it('is for those who manage webhooks only', async () => {
    // Who manages another part of the settings sees them, but not this one.
    fakeServer({
      user: { ...GRACE, permissions: [...GRACE.permissions, 'instance.mail.manage'] },
      webhooks: [DEPLOYS],
    });
    const { screen } = await renderApp({ path: '/settings/webhooks' });

    await expect.element(screen.getByRole('heading', { level: 1, name: 'Webhooks' })).toBeVisible();
    await expect.element(screen.getByText('Deployments')).not.toBeInTheDocument();
    await expect
      .element(
        screen
          .getByRole('navigation', { name: 'Settings sections' })
          .getByRole('link', { name: 'Webhooks' }),
      )
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByRole('link', { name: 'Add a webhook' }))
      .not.toBeInTheDocument();
  });
});

describe('adding a webhook', () => {
  it('sends what was chosen, shows its secret once, then opens its page', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    const server = fakeServer({ user: ADA, projects: [fakeProject('WEB', 'Website')] });
    const { screen } = await renderApp({ path: '/settings/webhooks' });

    await screen.getByRole('link', { name: 'Add a webhook' }).click();
    await screen.getByLabelText('Name').fill('Deployments');
    await screen.getByLabelText('Address').fill('https://deploy.example.com/hooks/toppo');
    await screen.getByRole('checkbox', { name: /An issue is created/ }).click();
    await screen.getByRole('checkbox', { name: /An issue changes status/ }).click();
    await screen.getByRole('radio', { name: 'Chosen projects' }).click();
    await screen.getByRole('checkbox', { name: /Website/ }).click();
    await screen.getByRole('button', { name: 'Add the webhook' }).click();

    const dialog = screen.getByRole('dialog', { name: 'Copy its secret now' });
    const secret = dialog.getByLabelText('Secret');
    await expect.element(secret).toBeVisible();
    expect(secret.element()).toHaveProperty('value', expect.stringMatching(/^whsec_/));
    await dialog.getByRole('button', { name: 'Copy' }).click();
    await expect.element(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringMatching(/^whsec_/));
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: '/api/v1/webhooks',
      body: {
        name: 'Deployments',
        url: 'https://deploy.example.com/hooks/toppo',
        events: ['issue.created', 'issue.statusChanged'],
        projects: ['WEB'],
        allowPrivate: false,
      },
    });

    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 1, name: 'Deployments' }))
      .toBeVisible();
    await expect.element(screen.getByText('https://deploy.example.com/hooks/toppo')).toBeVisible();
  });

  it('says what is missing before sending anything', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/webhooks/new' });

    await screen.getByRole('radio', { name: 'Chosen projects' }).click();
    await screen.getByRole('button', { name: 'Add the webhook' }).click();

    await expect.element(screen.getByText('This field is required.')).toBeVisible();
    await expect
      .element(screen.getByText('Enter a web address, such as https://example.com.'))
      .toBeVisible();
    await expect.element(screen.getByText('Choose at least one event.')).toBeVisible();
    await expect
      .element(screen.getByText('Choose at least one project, or all of them.'))
      .toBeVisible();
    expect(server.requests.some(({ method }) => method === 'POST')).toBe(false);
  });

  it('sends a request in clear only to an address inside the network', async () => {
    const server = fakeServer({ user: ADA });
    const { screen } = await renderApp({ path: '/settings/webhooks/new' });
    await screen.getByLabelText('Name').fill('Our server');
    await screen.getByLabelText('Address').fill('http://10.0.0.5/hooks');
    await screen.getByRole('button', { name: 'Choose all' }).click();

    await screen.getByRole('button', { name: 'Add the webhook' }).click();
    await expect
      .element(screen.getByText('Use an https address, or say it is inside your network.'))
      .toBeVisible();
    await screen.getByRole('switch', { name: 'An address inside your network' }).click();
    await screen.getByRole('button', { name: 'Add the webhook' }).click();

    await expect.element(screen.getByRole('dialog', { name: 'Copy its secret now' })).toBeVisible();
    expect(server.state.webhooks).toMatchObject([
      { url: 'http://10.0.0.5/hooks', allowPrivate: true, allProjects: true },
    ]);
    expect(server.state.webhooks[0]?.events).toHaveLength(16);
  });

  it('says why the server refused it', async () => {
    fakeServer({
      user: ADA,
      webhooks: Array.from({ length: 20 }, (_, n) => fakeWebhook(`Hook ${n}`)),
    });
    const { screen } = await renderApp({ path: '/settings/webhooks/new' });
    await screen.getByLabelText('Name').fill('One more');
    await screen.getByLabelText('Address').fill('https://hooks.example.com/');
    await screen.getByRole('checkbox', { name: /An issue is created/ }).click();

    await screen.getByRole('button', { name: 'Add the webhook' }).click();

    await expect
      .element(screen.getByRole('alert'))
      .toHaveTextContent('An instance keeps 20 webhooks at most: delete one first.');
  });
});

describe('a webhook’s page', () => {
  it('changes where and what it is sent', async () => {
    const { server, screen } = await openWebhook(DEPLOYS);
    const settings = screen.getByRole('region', { name: 'Where and what' });

    await expect.element(settings.getByLabelText('Name')).toHaveValue('Deployments');
    await expect
      .element(settings.getByRole('checkbox', { name: /An issue changes status/ }))
      .toBeChecked();
    await settings.getByLabelText('Name').fill('Releases');
    await settings.getByRole('checkbox', { name: /An issue changes status/ }).click();
    await settings.getByRole('button', { name: 'Save' }).click();

    await expect.element(settings.getByText('Saved.')).toBeVisible();
    await expect.element(screen.getByRole('heading', { level: 1, name: 'Releases' })).toBeVisible();
    expect(server.state.webhooks[0]).toMatchObject({ name: 'Releases', events: ['issue.created'] });
  });

  it('shows its deliveries, and sends one again or a test', async () => {
    const { server, screen } = await openWebhook({
      ...DEPLOYS,
      deliveries: [
        fakeDelivery({ eventType: 'issue.statusChanged', durationMs: 87 }),
        fakeDelivery({ status: 'pending', attempts: 2, responseStatus: 500, durationMs: 12 }),
        fakeDelivery({ status: 'failed', attempts: 5, responseStatus: null, error: 'TIMEOUT' }),
      ],
    });
    const deliveries = screen.getByRole('region', { name: 'Latest deliveries' });
    const rows = deliveries.getByRole('row');

    await expect
      .element(rows.nth(1))
      .toMatchTextContent('issue.statusChangedDelivered, answered 20487 ms');
    await expect.element(rows.nth(2)).toMatchTextContent('answered 500, tried again soon (2 of 5)');
    await expect.element(rows.nth(3)).toMatchTextContent('Given up: no answer in time');

    await rows
      .nth(1)
      .getByRole('button', { name: /Send again/ })
      .click();
    await expect.poll(() => deliveries.getByRole('row').elements().length).toBe(5);
    const [again, first] = server.state.webhooks[0]?.deliveries ?? [];
    expect(again?.messageId).toBe(first?.messageId);

    await screen.getByRole('button', { name: 'Send a test' }).click();
    await expect
      .element(screen.getByText('Test queued: it shows in the deliveries.'))
      .toBeVisible();
    await expect.element(deliveries.getByRole('row').nth(1)).toMatchTextContent('webhook.test');
  });

  it('renews its secret once confirmed, and shows the new one once', async () => {
    const { server, screen } = await openWebhook(DEPLOYS);

    await screen.getByRole('button', { name: 'Renew the secret' }).click();
    const dialog = screen.getByRole('dialog', { name: 'Renew the secret?' });
    await dialog.getByRole('button', { name: 'Renew', exact: true }).click();

    const shown = screen.getByRole('dialog', { name: 'Copy its secret now' });
    const secret = shown.getByLabelText('Secret');
    await expect.element(secret).toBeVisible();
    expect(secret.element()).toHaveProperty('value', expect.stringMatching(/^whsec_/));
    await shown.getByRole('button', { name: 'Done' }).click();
    await expect.element(shown).not.toBeInTheDocument();
    expect(server.requests).toContainEqual({
      method: 'POST',
      path: `/api/v1/webhooks/${DEPLOYS.id}/secret`,
      body: undefined,
    });
  });

  it('says Toppo stopped it, why, and enables it again', async () => {
    const { screen } = await openWebhook({
      ...DEPLOYS,
      enabled: false,
      failures: 10,
      lastError: 'HTTP_503',
    });
    const alert = screen.getByRole('alert');

    await expect
      .element(alert)
      .toMatchTextContent(
        'Toppo stopped this webhook: 10 deliveries in a row were given up. It is sent nothing until you enable it again.The last one: answered 503.',
      );
    await expect
      .element(screen.getByRole('button', { name: 'Send a test' }))
      .not.toBeInTheDocument();
    await alert.getByRole('button', { name: 'Enable again' }).click();

    await expect.element(screen.getByText('Enabled', { exact: true })).toBeVisible();
    await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
  });

  it('warns while its deliveries are given up', async () => {
    const { screen } = await openWebhook({ ...DEPLOYS, failures: 3, lastError: 'NETWORK_ERROR' });

    await expect
      .element(screen.getByText(/^Its last 3 deliveries were given up\. After 10 in a row/))
      .toBeVisible();
    await expect.element(screen.getByText('The last one: unreachable.')).toBeVisible();
  });

  it('is disabled and enabled again', async () => {
    const { screen } = await openWebhook(DEPLOYS);

    await screen.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect.element(screen.getByText('Disabled', { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole('button', { name: /Send again|Send a test/ }))
      .not.toBeInTheDocument();

    await screen.getByRole('button', { name: 'Enable', exact: true }).click();
    await expect.element(screen.getByText('Enabled', { exact: true })).toBeVisible();
  });

  it('is deleted once confirmed, back to the list', async () => {
    const { server, screen } = await openWebhook(DEPLOYS);

    await screen.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = screen.getByRole('dialog', { name: 'Delete Deployments?' });
    await dialog.getByRole('button', { name: 'Delete the webhook' }).click();

    await expect
      .element(screen.getByRole('heading', { level: 2, name: 'No webhook yet' }))
      .toBeVisible();
    expect(server.state.webhooks).toStrictEqual([]);
  });

  it('says when there is no such webhook', async () => {
    fakeServer({ user: ADA });
    const { screen } = await renderApp({
      path: '/settings/webhooks/01a1569b-9900-7000-8000-000000001399',
    });

    await expect
      .element(screen.getByText('No webhook here: it may have been deleted.'))
      .toBeVisible();
  });
});
