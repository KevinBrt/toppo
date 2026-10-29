import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { schema } from '@toppo-tracker/db';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHostCalls, createJobs } from './app.ts';
import { runPluginJobJob } from './features/plugins/jobs/run-plugin-job.job.ts';
import { schedulePluginJobsJob } from './features/plugins/jobs/schedule-plugin-jobs.job.ts';
import { runNextJob, type WorkerContext } from './platform/jobs/job-worker.ts';
import { enqueue } from './platform/jobs/jobs.ts';
import type { PackageStore } from './platform/plugins/packages/package-store.ts';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import type { PluginRuntime } from './platform/plugins/runtime/plugin-runtime.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestPackageStore,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testPlugins,
  testServices,
} from './test-helpers.ts';

/*
 * A plugin reaches outside Toppo where its manifest says, never inside the network unless its
 * approval names the host; its secrets are sealed once typed and given to it only; its jobs run
 * on their own, as itself; its last calls show on its page.
 */

const context = setupTestDatabase();
let packages: PackageStore;
let runtime: PluginRuntime;
let app: FastifyInstance;
let worker: WorkerContext;
let adminCookie: string;
let chat: Server;
let chatUrl = '';
/** What the team's chat received. */
let received: { method: string; body: string }[] = [];

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

/**
 * Tells the chat in its settings when its job runs; an action fetches the address it is given
 * and answers how it went. Its settings check refuses an address that is no text, as a sealed
 * one would be.
 */
const RUN = `
  if (kind === 'settings') {
    const { chatUrl } = JSON.parse(payload);
    return JSON.stringify(chatUrl === undefined || typeof chatUrl === 'string'
      ? { ok: true, result: null }
      : { ok: false, error: { code: 'VALIDATION_FAILED', issues: [{ path: 'chatUrl', message: 'Not a text' }] } });
  }
  if (kind === 'job') {
    const { chatUrl } = JSON.parse(context).settings;
    try {
      await __host.call('http.fetch', JSON.stringify({
        url: chatUrl, method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'Week 44: 32 h' }),
      }));
      return JSON.stringify({ ok: true, result: null });
    } catch (error) {
      return JSON.stringify({ ok: false, error: { code: 'PLUGIN_ERROR' }, detail: error.message });
    }
  }
  const { url } = JSON.parse(payload);
  try {
    const answer = JSON.parse(await __host.call('http.fetch', JSON.stringify({ url })));
    return JSON.stringify({ ok: true, result: { status: answer.status } });
  } catch (error) {
    return JSON.stringify({ ok: true, result: { failed: error.message } });
  }
`;

const words = (chat: string) => ({
  plugin: { name: 'Notifier', description: 'Tells the chat.' },
  settings: { chatUrl: { label: chat }, team: { label: 'Team' } },
  jobs: { tell: 'Tells the chat every week' },
});

function notifier(overrides: Partial<Manifest> = {}): Manifest {
  return testManifest({
    id: 'notifier',
    needs: [],
    permissions: {},
    settings: {
      type: 'object',
      properties: {
        chatUrl: { type: 'string', format: 'uri', writeOnly: true },
        team: { type: 'string' },
      },
    },
    messages: { en: words('Chat webhook'), fr: words('Webhook du chat') },
    actions: [{ name: 'chat.ping', access: 'authenticated', input: {} }],
    events: [],
    jobs: [{ name: 'tell', every: 'week', label: 'jobs.tell' }],
    http: { fromSettings: ['chatUrl'] },
    ...overrides,
  });
}

function call(method: 'GET' | 'POST' | 'PUT', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

async function install(manifest: Manifest, privateHosts: string[] = []): Promise<void> {
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip' },
    payload: testPackage({ manifest, run: RUN }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  await approve(manifest.id, privateHosts);
}

async function approve(slug: string, privateHosts: string[]): Promise<void> {
  const approved = await call('POST', `/api/v1/plugins/${slug}/approve`, {
    projects: 'all',
    privateHosts,
  });
  expect(approved.statusCode, approved.body).toBe(204);
}

async function saveSettings(body: object) {
  return await call('PUT', '/api/v1/plugins/notifier/settings', body);
}

async function ping(url: string): Promise<unknown> {
  const answered = await call('POST', '/api/v1/plugins/notifier/actions/chat.ping', { url });
  expect(answered.statusCode, answered.body).toBe(200);
  return answered.json<{ result: unknown }>().result;
}

/** Runs every job due, as a server's worker would. */
async function runJobs(): Promise<void> {
  while (await runNextJob(worker)) {
    // Until none is due.
  }
}

/** Runs the plugin's weekly job now, as if its week had passed. */
async function tellNow(): Promise<void> {
  const [plugin] = await context.database.db
    .select({ id: schema.plugins.id })
    .from(schema.plugins)
    .where(eq(schema.plugins.slug, 'notifier'));
  await enqueue(context.database.db, runPluginJobJob, { pluginId: plugin?.id ?? '', job: 'tell' });
  await runJobs();
}

async function details() {
  const shown = await call('GET', '/api/v1/plugins/notifier');
  expect(shown.statusCode).toBe(200);
  return shown;
}

beforeAll(async () => {
  chat = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      received.push({ method: request.method ?? '', body: Buffer.concat(chunks).toString() });
      response.end('ok');
    });
  });
  await new Promise<void>((resolve) => chat.listen(0, '127.0.0.1', resolve));
  chatUrl = `http://127.0.0.1:${(chat.address() as AddressInfo).port}/hooks/T0`;
  packages = await createTestPackageStore();
  runtime = (await testPlugins(packages)).runtime;
  app = await buildTestApp({ database: context.database, packages });
  const base = testServices();
  worker = {
    db: context.database.db,
    jobs: createJobs({ files: await createTestFileStorage(), packages }),
    log: app.log,
    services: { ...base, plugins: { ...base.plugins, runtime, calls: createHostCalls() } },
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
});

afterAll(async () => {
  await app.close();
  await runtime.close();
  chat.closeAllConnections();
  await new Promise<void>((resolve) => chat.close(() => resolve()));
});

beforeEach(async () => {
  received = [];
  await context.database.db.delete(schema.plugins);
  await context.database.db.delete(schema.jobs);
  await context.database.db.delete(schema.rateLimitCounters);
});

describe('a plugin’s secret', () => {
  it('is sealed as it is saved, never shown again, and kept until replaced or cleared', async () => {
    await install(notifier());

    expect((await saveSettings({ values: { chatUrl, team: 'Billing' } })).statusCode).toBe(204);
    const shown = await details();
    const [stored] = await context.database.db
      .select({ settings: schema.plugins.settings })
      .from(schema.plugins);

    expect(shown.body).not.toContain(chatUrl);
    expect(shown.json()).toMatchObject({
      settings: {
        fields: [
          { name: 'chatUrl', secret: { set: true } },
          { name: 'team', secret: null },
        ],
        values: { team: 'Billing' },
      },
    });
    expect(JSON.stringify(stored?.settings)).not.toContain('127.0.0.1');
    expect(stored?.settings['chatUrl']).toStrictEqual({ sealed: expect.any(String) });

    expect((await saveSettings({ values: { team: 'Operations' } })).statusCode).toBe(204);
    expect((await details()).json()).toMatchObject({
      settings: {
        fields: [{ secret: { set: true } }, { secret: null }],
        values: { team: 'Operations' },
      },
    });
    expect((await saveSettings({ values: {}, clearSecrets: ['chatUrl'] })).statusCode).toBe(204);
    expect((await details()).json()).toMatchObject({
      settings: { fields: [{ secret: { set: false } }, { secret: null }], values: {} },
    });
  });

  it('is cleared only when it is one', async () => {
    await install(notifier());

    const refused = await saveSettings({ values: {}, clearSecrets: ['team'] });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ error: { code: 'PLUGIN_SETTINGS_INVALID' } });
  });
});

describe('a plugin reaching outside Toppo', () => {
  it('shows who approves it where it may go and what it does on its own', async () => {
    await install(notifier(), ['127.0.0.1', 'chat.internal']);

    expect((await details()).json()).toMatchObject({
      http: { kind: 'settings', settings: [{ en: 'Chat webhook', fr: 'Webhook du chat' }] },
      jobs: [
        {
          name: 'tell',
          every: 'week',
          label: { en: 'Tells the chat every week', fr: 'Tells the chat every week' },
        },
      ],
      privateHosts: ['127.0.0.1', 'chat.internal'],
      httpCalls: [],
    });
  });

  it('refuses hosts an approval cannot name', async () => {
    await install(notifier());

    const refused = await call('POST', '/api/v1/plugins/notifier/approve', {
      projects: 'all',
      privateHosts: ['http://chat.internal:8065'],
    });

    expect(refused.statusCode).toBe(400);
  });

  it('reaches the team’s own chat only once its approval names it, then on its own each week', async () => {
    await install(notifier());
    await saveSettings({ values: { chatUrl } });

    await tellNow();

    expect(received).toStrictEqual([]);
    const [failing] = await context.database.db
      .select({ failures: schema.plugins.failures, lastError: schema.plugins.lastError })
      .from(schema.plugins);
    expect(failing?.failures).toBe(1);
    expect((await details()).json()).toMatchObject({
      httpCalls: [
        { method: 'POST', host: chatUrl.split('/')[2], status: null, error: 'ADDRESS_NOT_ALLOWED' },
      ],
    });

    await approve('notifier', ['127.0.0.1']);
    await context.database.db.delete(schema.jobs);
    await tellNow();

    expect(received).toStrictEqual([{ method: 'POST', body: '{"text":"Week 44: 32 h"}' }]);
    const [next] = await context.database.db
      .select({
        type: schema.jobs.type,
        inDays: sql<number>`extract(epoch from ${schema.jobs.runAt} - now()) / 86400`,
      })
      .from(schema.jobs);
    expect(next?.type).toBe('plugin.job');
    expect(Number(next?.inDays)).toBeGreaterThan(6.9);
    expect((await details()).json()).toMatchObject({
      failures: 0,
      httpCalls: [{ status: 200, error: null }, { error: 'ADDRESS_NOT_ALLOWED' }],
    });
  });

  it.each([
    ['a host it did not declare', notifier(), 'https://hooks.example.com/T0', 'HOST_NOT_DECLARED'],
    [
      'a cloud’s metadata',
      notifier({ http: 'any' }),
      'http://169.254.169.254/latest',
      'ADDRESS_NOT_ALLOWED',
    ],
    ['a file', notifier({ http: 'any' }), 'file:///etc/passwd', 'ADDRESS_NOT_ALLOWED'],
  ])('never reaches %s', async (_, manifest, url, failure) => {
    await install(manifest);

    expect(await ping(url)).toStrictEqual({ failed: failure });
  });

  it('sends 60 requests a minute at most', async () => {
    await install(notifier({ http: 'any' }));
    await context.database.db.insert(schema.rateLimitCounters).values({
      key: 'plugin-http:notifier',
      count: 60,
      expiresAt: sql`now() + interval '1 minute'`,
    });

    expect(await ping('https://hooks.example.com/T0')).toStrictEqual({ failed: 'TOO_MANY_CALLS' });
  });

  it('keeps its last 50 calls', async () => {
    await install(notifier({ http: 'any' }), ['127.0.0.1']);
    const [plugin] = await context.database.db
      .select({ id: schema.plugins.id })
      .from(schema.plugins);
    await context.database.db.insert(schema.pluginHttpCalls).values(
      Array.from({ length: 50 }, () => ({
        pluginId: plugin?.id ?? '',
        method: 'GET',
        host: 'old.example.com',
        status: 200,
        durationMs: 12,
        createdAt: sql`now() - interval '1 day'`,
      })),
    );

    expect(await ping(chatUrl)).toStrictEqual({ status: 200 });

    const calls = (await details()).json<{ httpCalls: { host: string }[] }>().httpCalls;
    expect(calls).toHaveLength(50);
    expect(calls[0]?.host).toBe(chatUrl.split('/')[2]);
  });
});

describe('a plugin’s jobs', () => {
  it('are queued once each while it is enabled, and run no more once it is not', async () => {
    await install(notifier());
    const queued = () =>
      context.database.db
        .select({ uniqueKey: schema.jobs.uniqueKey })
        .from(schema.jobs)
        .where(eq(schema.jobs.type, 'plugin.job'));

    for (const _ of [1, 2]) {
      await context.database.db.transaction((tx) =>
        schedulePluginJobsJob.run(
          { tx, db: context.database.db, log: app.log, services: worker.services },
          {},
        ),
      );
    }
    expect(await queued()).toStrictEqual([
      { uniqueKey: expect.stringMatching(/^plugin\.job:.+:tell$/) },
    ]);

    expect((await call('POST', '/api/v1/plugins/notifier/disable')).statusCode).toBe(204);
    await context.database.db.update(schema.jobs).set({ runAt: sql`now()` });
    await runJobs();

    expect(await queued()).toStrictEqual([]);
  });
});
