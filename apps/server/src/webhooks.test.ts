import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { schema } from '@toppo-tracker/db';
import { EVENT_TYPES } from '@toppo-tracker/plugin-sdk/protocol';
import { ISSUE_DESCRIPTION_MAX_LENGTH } from '@toppo-tracker/shared';
import { startSmtpServer, type TestSmtpServer } from '@toppo-tracker/testing';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobs } from './app.ts';
import { verifyWebhook } from './platform/http/signatures/standard-webhooks.ts';
import { runNextJob, type WorkerContext } from './platform/jobs/job-worker.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestPackageStore,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from './test-helpers.ts';

/*
 * A webhook tells an address what changes on issues, signed as Standard Webhooks writes it: the
 * events chosen, in the projects chosen, through the guard of what leaves Toppo. A delivery that
 * fails is tried again, then given up; given up again and again, the webhook stops and the
 * administrators are told.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
let worker: WorkerContext;
let mail: TestSmtpServer;
let adminCookie: string;
let receiver: Server;
let base = '';
/** What the receiver was sent, oldest first. */
let received: { path: string; headers: IncomingHttpHeaders; body: string }[] = [];

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

/** Adds a webhook told of what is given, answering its id and key. */
async function addWebhook(overrides: Record<string, unknown> = {}) {
  const created = await call('POST', '/api/v1/webhooks', {
    name: 'CI',
    url: `${base}/ok`,
    events: ['issue.created', 'issue.statusChanged'],
    projects: ['WEB'],
    allowPrivate: true,
    ...overrides,
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ id: string; secret: string }>();
}

async function report(projectKey: string, description = 'Since this morning.'): Promise<string> {
  const created = await call('POST', `/api/v1/projects/${projectKey}/issues`, {
    title: 'Invoices fail to download',
    description,
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ key: string }>().key;
}

/** Runs every job due, as a server's worker would. */
async function runJobs(): Promise<void> {
  while (await runNextJob(worker)) {
    // Until none is due.
  }
}

/** Runs the jobs due, then those waiting to be tried again, `rounds` times, by the database's clock. */
async function runRetries(rounds: number): Promise<void> {
  for (let round = 0; round < rounds; round += 1) {
    await runJobs();
    await context.database.db.update(schema.jobs).set({ runAt: sql`now()` });
  }
}

async function details(webhookId: string) {
  const shown = await call('GET', `/api/v1/webhooks/${webhookId}`);
  expect(shown.statusCode).toBe(200);
  return shown.json<{
    enabled: boolean;
    failures: number;
    lastError: string | null;
    deliveries: {
      status: string;
      responseStatus: number | null;
      error: string | null;
      attempts: number;
      messageId: string;
      id: string;
    }[];
  }>();
}

beforeAll(async () => {
  mail = await startSmtpServer();
  receiver = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = request.url ?? '/';
      received.push({ path, headers: request.headers, body: Buffer.concat(chunks).toString() });
      if (path === '/fail') {
        response.writeHead(500).end('down');
      } else if (path === '/redirect') {
        response.writeHead(302, { location: '/ok' }).end();
      } else {
        response.writeHead(204).end();
      }
    });
  });
  await new Promise<void>((resolve) => receiver.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}`;
  app = await buildTestApp({
    database: context.database,
    packages: await createTestPackageStore(),
  });
  worker = {
    db: context.database.db,
    jobs: createJobs({
      files: await createTestFileStorage(),
      packages: await createTestPackageStore(),
    }),
    log: app.log,
    services: testServices(),
  };
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  adminCookie = cookieHeader(
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      body: { email: 'ada@example.com', password: PASSWORD },
    }),
  );
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['OPS', 'Operations'],
  ]) {
    expect((await call('POST', '/api/v1/projects', { key, name })).statusCode).toBe(201);
  }
  await context.database.db.insert(schema.mailSettings).values({
    host: '127.0.0.1',
    port: mail.port,
    security: 'none',
    fromAddress: 'toppo@example.com',
    fromName: 'Toppo',
  });
});

afterAll(async () => {
  await app.close();
  await mail.close();
  receiver.closeAllConnections();
  await new Promise<void>((resolve) => receiver.close(() => resolve()));
});

beforeEach(async () => {
  await context.database.db.delete(schema.webhooks);
  await context.database.db.delete(schema.jobs);
  await context.database.db.delete(schema.rateLimitCounters);
  received = [];
});

describe('a webhook', () => {
  it('tells its address of the events chosen, in the projects chosen, signed with its key', async () => {
    const { id, secret } = await addWebhook();
    const key = await report('WEB', 'Since **this** morning.');
    await report('OPS');
    await runJobs();

    expect(received).toHaveLength(1);
    const [sent] = received;
    const now = Math.floor(Date.now() / 1000);
    const headers = {
      'webhook-id': String(sent?.headers['webhook-id']),
      'webhook-timestamp': String(sent?.headers['webhook-timestamp']),
      'webhook-signature': String(sent?.headers['webhook-signature']),
    };
    expect(verifyWebhook(secret, headers, sent?.body ?? '', now)).toBe(true);
    expect(sent?.headers['content-type']).toBe('application/json');
    const payload = JSON.parse(sent?.body ?? '{}');
    expect(payload).toMatchObject({
      type: 'issue.created',
      data: {
        event: { id: headers['webhook-id'], type: 'issue.created' },
        issue: {
          key,
          projectKey: 'WEB',
          title: 'Invoices fail to download',
          description: 'Since **this** morning.',
        },
        change: {},
      },
    });
    expect((await details(id)).deliveries).toMatchObject([
      { status: 'delivered', responseStatus: 204, error: null, attempts: 1 },
    ]);
  });

  it('is told of nothing it did not choose, and of nothing once disabled', async () => {
    const { id } = await addWebhook({ events: ['issue.commented'], projects: 'all' });
    await report('OPS');
    await runJobs();
    expect(received).toStrictEqual([]);

    expect((await call('POST', `/api/v1/webhooks/${id}/disable`)).statusCode).toBe(204);
    const key = await report('WEB');
    expect(
      (await call('POST', `/api/v1/issues/${key}/comments`, { body: 'Seen.' })).statusCode,
    ).toBe(201);
    await runJobs();

    expect(received).toStrictEqual([]);
    expect(await context.database.db.select().from(schema.webhookDeliveries)).toStrictEqual([]);
  });

  it('tells a comment with its text, and an issue deleted by its key', async () => {
    await addWebhook({ events: ['issue.commented', 'issue.deleted'] });
    const key = await report('WEB');
    const commented = await call('POST', `/api/v1/issues/${key}/comments`, {
      body: 'Fixed in **1.2**.',
    });
    expect(commented.statusCode).toBe(201);
    // Told once the jobs run: a comment gone by then is no longer told.
    await runJobs();
    expect((await call('DELETE', `/api/v1/issues/${key}`)).statusCode).toBe(204);
    await runJobs();

    const told = received.map(({ body }) => JSON.parse(body));
    expect(told).toMatchObject([
      {
        type: 'issue.commented',
        data: { change: { comment: { body: 'Fixed in **1.2**.', mentioned: [] } } },
      },
      { type: 'issue.deleted', data: { issue: { key }, change: {} } },
    ]);
    expect(told[1].data.issue).not.toHaveProperty('title');
  });

  it('takes any event plugins hear of, and refuses one they do not', async () => {
    await addWebhook({ events: [...EVENT_TYPES] });

    const refused = await call('POST', '/api/v1/webhooks', {
      name: 'CI',
      url: `${base}/ok`,
      events: ['issue.exploded'],
      projects: 'all',
      allowPrivate: true,
    });
    expect(refused.statusCode).toBe(400);
  });

  it('reaches inside the network only as allowed, and an address in clear http nowhere else', async () => {
    const inClear = await call('POST', '/api/v1/webhooks', {
      name: 'CI',
      url: `${base}/ok`,
      events: ['issue.created'],
      projects: 'all',
    });
    expect(inClear.statusCode).toBe(400);

    const { id } = await addWebhook({ url: 'https://127.0.0.1:1/hooks', allowPrivate: false });
    await report('WEB');
    await runJobs();

    expect((await details(id)).deliveries).toMatchObject([
      { status: 'pending', error: 'ADDRESS_NOT_ALLOWED', responseStatus: null },
    ]);
  });

  it('never follows a redirect', async () => {
    const { id } = await addWebhook({ url: `${base}/redirect` });
    await report('WEB');
    await runJobs();

    expect(received.map(({ path }) => path)).toStrictEqual(['/redirect']);
    expect((await details(id)).deliveries).toMatchObject([{ error: 'TOO_MANY_REDIRECTS' }]);
  });

  it('tries a delivery again, gives it up, and stops after ten given up in a row, telling the administrators', async () => {
    const { id } = await addWebhook({ url: `${base}/fail` });
    await context.database.db
      .update(schema.webhooks)
      .set({ failures: 9 })
      .where(eq(schema.webhooks.id, id));
    const before = mail.received.length;

    await report('WEB');
    await runRetries(6);

    expect(received).toHaveLength(5);
    expect(new Set(received.map(({ headers }) => headers['webhook-id'])).size).toBe(1);
    expect(await details(id)).toMatchObject({
      enabled: false,
      failures: 10,
      lastError: 'HTTP_500',
      deliveries: [{ status: 'failed', responseStatus: 500, attempts: 5 }],
    });
    const sent = mail.received.slice(before);
    expect(sent.map(({ to }) => to)).toStrictEqual([['ada@example.com']]);
    expect(sent[0]?.subject).toBe('Toppo stopped the webhook CI');
    expect(sent[0]?.content).toContain('The last time, it answered 500.');

    expect((await call('POST', `/api/v1/webhooks/${id}/enable`)).statusCode).toBe(204);
    expect(await details(id)).toMatchObject({ enabled: true, failures: 0, lastError: null });
  });

  it('sends a test, and a delivery again under the same id', async () => {
    const { id, secret } = await addWebhook();

    const test = await call('POST', `/api/v1/webhooks/${id}/test`);
    expect(test.statusCode).toBe(202);
    await runJobs();
    const [delivery] = (await details(id)).deliveries;
    const again = await call('POST', `/api/v1/webhooks/${id}/deliveries/${delivery?.id}/redeliver`);
    expect(again.statusCode).toBe(202);
    await runJobs();

    expect(received.map(({ body }) => JSON.parse(body).type)).toStrictEqual([
      'webhook.test',
      'webhook.test',
    ]);
    expect(received[1]?.headers['webhook-id']).toBe(received[0]?.headers['webhook-id']);
    expect(received[1]?.body).toBe(received[0]?.body);
    const now = Math.floor(Date.now() / 1000);
    for (const sent of received) {
      const headers = Object.fromEntries(
        ['webhook-id', 'webhook-timestamp', 'webhook-signature'].map((name) => [
          name,
          String(sent.headers[name]),
        ]),
      );
      expect(verifyWebhook(secret, headers, sent.body, now)).toBe(true);
    }
  });

  it('never shows its key again, and signs with a new one once it is renewed', async () => {
    const { id, secret } = await addWebhook();
    expect(JSON.stringify(await details(id))).not.toContain(secret);

    const renewed = await call('POST', `/api/v1/webhooks/${id}/secret`);
    expect(renewed.statusCode).toBe(200);
    const { secret: next } = renewed.json<{ secret: string }>();
    await call('POST', `/api/v1/webhooks/${id}/test`);
    await runJobs();

    const [sent] = received;
    const headers = Object.fromEntries(
      ['webhook-id', 'webhook-timestamp', 'webhook-signature'].map((name) => [
        name,
        String(sent?.headers[name]),
      ]),
    );
    const now = Math.floor(Date.now() / 1000);
    expect(verifyWebhook(next, headers, sent?.body ?? '', now)).toBe(true);
    expect(verifyWebhook(secret, headers, sent?.body ?? '', now)).toBe(false);
  });

  it('keeps its last 50 deliveries, never one still to send', async () => {
    const { id } = await addWebhook();
    await context.database.db.insert(schema.webhookDeliveries).values(
      Array.from({ length: 55 }, () => ({
        webhookId: id,
        messageId: id,
        eventType: 'webhook.test',
        payload: {},
        status: 'delivered' as const,
        createdAt: sql`now() - interval '1 day'`,
      })),
    );

    await call('POST', `/api/v1/webhooks/${id}/test`);

    const kept = await context.database.db
      .select({ status: schema.webhookDeliveries.status })
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.webhookId, id));
    expect(kept).toHaveLength(50);
    expect(kept.filter(({ status }) => status === 'pending')).toHaveLength(1);
  });

  it('is one of 20 at most', async () => {
    await context.database.db.insert(schema.webhooks).values(
      Array.from({ length: 20 }, (_, n) => ({
        name: `Hook ${n}`,
        url: 'https://hooks.example.com/',
        secretSealed: 'sealed',
        events: ['issue.created'],
      })),
    );

    const refused = await call('POST', '/api/v1/webhooks', {
      name: 'One more',
      url: 'https://hooks.example.com/',
      events: ['issue.created'],
      projects: 'all',
    });

    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ error: { code: 'WEBHOOK_LIMIT_REACHED' } });
  });

  it('is changed, listed and removed', async () => {
    const { id } = await addWebhook();
    const changed = {
      name: 'Deploys',
      url: 'https://hooks.example.com/toppo',
      events: ['issue.commented', 'issue.commented'],
      projects: ['OPS', 'WEB'],
    };
    expect((await call('PUT', `/api/v1/webhooks/${id}`, changed)).statusCode).toBe(204);

    const listed = await call('GET', '/api/v1/webhooks');
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toMatchObject({
      webhooks: [
        {
          id,
          name: 'Deploys',
          url: 'https://hooks.example.com/toppo',
          events: ['issue.commented'],
          allProjects: false,
          projects: [{ key: 'OPS' }, { key: 'WEB' }],
          allowPrivate: false,
          enabled: true,
        },
      ],
    });
    expect(
      (await call('PUT', `/api/v1/webhooks/${id}`, { ...changed, projects: 'all' })).statusCode,
    ).toBe(204);
    expect(await details(id)).toMatchObject({ allProjects: true, projects: [] });

    expect((await call('DELETE', `/api/v1/webhooks/${id}`)).statusCode).toBe(204);
    expect((await call('GET', `/api/v1/webhooks/${id}`)).statusCode).toBe(404);
    expect((await call('PUT', `/api/v1/webhooks/${id}`, changed)).statusCode).toBe(404);
    expect((await call('DELETE', `/api/v1/webhooks/${id}`)).statusCode).toBe(404);
  });

  it('is told of projects that exist only', async () => {
    const refused = await call('POST', '/api/v1/webhooks', {
      name: 'CI',
      url: 'https://hooks.example.com/',
      events: ['issue.created'],
      projects: ['WEB', 'NOPE'],
    });

    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ error: { code: 'PROJECT_NOT_FOUND' } });
  });

  it('sends nothing once disabled, not even what was queued before', async () => {
    const { id } = await addWebhook();
    expect((await call('POST', `/api/v1/webhooks/${id}/test`)).statusCode).toBe(202);
    expect((await call('POST', `/api/v1/webhooks/${id}/disable`)).statusCode).toBe(204);
    await runJobs();

    expect(received).toStrictEqual([]);
    const [delivery] = (await details(id)).deliveries;
    expect(delivery).toMatchObject({ status: 'failed', error: 'WEBHOOK_DISABLED' });
    const test = await call('POST', `/api/v1/webhooks/${id}/test`);
    expect(test.statusCode).toBe(409);
    expect(test.json()).toMatchObject({ error: { code: 'WEBHOOK_DISABLED' } });
    const again = await call('POST', `/api/v1/webhooks/${id}/deliveries/${delivery?.id}/redeliver`);
    expect(again.statusCode).toBe(409);
  });

  it('sends again only a delivery of its own that it still keeps', async () => {
    const { id } = await addWebhook();
    const other = await addWebhook({ name: 'Other' });
    await call('POST', `/api/v1/webhooks/${other.id}/test`);
    const [theirs] = (await details(other.id)).deliveries;

    const again = await call('POST', `/api/v1/webhooks/${id}/deliveries/${theirs?.id}/redeliver`);

    expect(again.statusCode).toBe(404);
    expect(again.json()).toMatchObject({ error: { code: 'WEBHOOK_DELIVERY_NOT_FOUND' } });
  });

  it('gives a delivery up at once when its key can no longer be read', async () => {
    const { id } = await addWebhook();
    await context.database.db
      .update(schema.webhooks)
      .set({ secretSealed: 'not sealed by this instance' })
      .where(eq(schema.webhooks.id, id));

    await call('POST', `/api/v1/webhooks/${id}/test`);
    await runJobs();

    expect(received).toStrictEqual([]);
    expect(await details(id)).toMatchObject({
      failures: 1,
      lastError: 'SECRET_UNREADABLE',
      deliveries: [{ status: 'failed', error: 'SECRET_UNREADABLE', attempts: 1 }],
    });
  });

  it('keeps a delivery of any event plugins hear of, at its largest', async () => {
    const { id } = await addWebhook();
    // Each character escaped by JSON in six bytes, a description changed at its longest.
    const longest = '\u0001'.repeat(ISSUE_DESCRIPTION_MAX_LENGTH);

    await context.database.db.insert(schema.webhookDeliveries).values(
      EVENT_TYPES.map((eventType) => ({
        webhookId: id,
        messageId: id,
        eventType,
        payload:
          eventType === 'issue.descriptionChanged'
            ? { data: { issue: { description: longest }, change: { from: longest, to: longest } } }
            : {},
      })),
    );
  });

  it('keeps its address as browsers write it, never with credentials', async () => {
    const { id } = await addWebhook({ url: 'HTTPS://Hooks.Example.com' });
    expect(await details(id)).toMatchObject({ url: 'https://hooks.example.com/' });

    for (const url of ['https://ci:hunter2@hooks.example.com/', 'https://ci@hooks.example.com/']) {
      const refused = await call('POST', '/api/v1/webhooks', {
        name: 'CI',
        url,
        events: ['issue.created'],
        projects: 'all',
      });
      expect(refused.statusCode, url).toBe(400);
    }
  });
});
