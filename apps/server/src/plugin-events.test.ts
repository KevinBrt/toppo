import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import { startSmtpServer, type TestSmtpServer } from '@toppo-tracker/testing';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHostCalls, createJobs } from './app.ts';
import { runNextJob, type WorkerContext } from './platform/jobs/job-worker.ts';
import type { PackageStore } from './platform/plugins/packages/package-store.ts';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import type { PluginRuntime } from './platform/plugins/runtime/plugin-runtime.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestPackageStore,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testPlugins,
  testServices,
} from './test-helpers.ts';

/*
 * A plugin hears of the changes made in its projects and acts on them as itself: its own user,
 * its approved needs, nothing more. Each change reaches it once its job runs, and what it writes
 * is written once, however many times the job runs. One that keeps failing is disabled, and
 * those who manage plugins are told by email.
 */

const context = setupTestDatabase();
let packages: PackageStore;
let runtime: PluginRuntime;
let app: FastifyInstance;
let worker: WorkerContext;
let mail: TestSmtpServer;
let adminCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

/** Comments on every status change it hears of, once per event. */
const COMMENTS_EACH_CHANGE = `
  const { event, issue, change } = JSON.parse(payload);
  await __host.call('issues.comment', JSON.stringify({
    issueId: issue.id,
    body: 'Moved from ' + change.from.name + ' to ' + change.to.name,
    once: event.id,
  }));
  return JSON.stringify({ ok: true, result: null });
`;

function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

async function install(manifest: Manifest, run: string, projects: 'all' | string[] = ['WEB']) {
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip' },
    payload: testPackage({ manifest, run }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  const approved = await call('POST', `/api/v1/plugins/${manifest.id}/approve`, { projects });
  expect(approved.statusCode, approved.body).toBe(204);
}

/** The manifest of a plugin hearing of status changes, which may read and comment. */
const listener = (overrides: Partial<Manifest> = {}) =>
  testManifest({
    needs: ['issue.read', 'comment.create'],
    events: ['issue.statusChanged'],
    ...overrides,
  });

async function report(projectKey: string): Promise<string> {
  const created = await call('POST', `/api/v1/projects/${projectKey}/issues`, {
    title: 'Invoices fail to download',
  });
  expect(created.statusCode, created.body).toBe(201);
  const { key } = created.json<{ key: string }>();
  return key;
}

/** Moves an issue to one of the default statuses, by its kind: `inProgress`. */
async function move(issueKey: string, kind: string): Promise<void> {
  const statusId = DEFAULT_STATUSES.find((status) => status.kind === kind)?.id;
  const moved = await call('PUT', `/api/v1/issues/${issueKey}/status`, { statusId });
  expect(moved.statusCode, moved.body).toBe(204);
}

/** Runs every job due, as a server's worker would. */
async function runJobs(): Promise<void> {
  while (await runNextJob(worker)) {
    // Until none is due.
  }
}

/** The id of the issue with `issueKey`. */
async function issueIdOf(issueKey: string): Promise<string> {
  const [projectKey, number] = issueKey.split('-');
  const [issue] = await context.database.db
    .select({ id: schema.issues.id })
    .from(schema.issues)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.issues.projectId))
    .where(
      and(eq(schema.projects.key, projectKey ?? ''), eq(schema.issues.number, Number(number))),
    );
  return issue?.id ?? '';
}

/** The comments on an issue, oldest first, with who wrote them. */
async function commentsOn(issueKey: string) {
  const [projectKey, number] = issueKey.split('-');
  return await context.database.db
    .select({ body: schema.comments.body, author: schema.users.name })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .innerJoin(schema.issues, eq(schema.issues.id, schema.comments.issueId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.issues.projectId))
    .where(and(eq(schema.projects.key, projectKey ?? ''), eq(schema.issues.number, Number(number))))
    .orderBy(schema.comments.createdAt);
}

async function pluginState(slug: string) {
  const [plugin] = await context.database.db
    .select({ state: schema.plugins.state, failures: schema.plugins.failures })
    .from(schema.plugins)
    .where(eq(schema.plugins.slug, slug));
  return plugin;
}

beforeAll(async () => {
  mail = await startSmtpServer();
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
  await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
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
  await runtime.close();
  await mail.close();
});

beforeEach(async () => {
  await context.database.db.delete(schema.plugins);
  await runJobs();
});

describe('a plugin hearing of events', () => {
  it('acts on a change in its projects, as itself, and writes once however often it runs', async () => {
    await install(listener(), COMMENTS_EACH_CHANGE);
    const key = await report('WEB');

    await move(key, 'inProgress');
    await runJobs();

    expect(await commentsOn(key)).toMatchObject([
      { body: 'Moved from New to In progress', author: 'Time tracking' },
    ]);
    // Its job runs again, as after a server stopped mid-way: nothing more is written.
    const [activity] = await context.database.db
      .select({ id: schema.activities.id })
      .from(schema.activities)
      .where(eq(schema.activities.type, 'issue.statusChanged'));
    const [plugin] = await context.database.db
      .select({ id: schema.plugins.id })
      .from(schema.plugins);
    await context.database.db.insert(schema.jobs).values({
      type: 'plugin.events',
      payload: { pluginId: plugin?.id, activityIds: [activity?.id] },
    });
    await runJobs();
    expect(await commentsOn(key)).toHaveLength(1);
  });

  it('hears nothing of the projects it was not approved for, nor of what it writes itself', async () => {
    await install(
      listener({ events: ['issue.statusChanged', 'issue.commented'] }),
      `if (name === 'issue.commented') { throw new Error('It heard of its own comment'); }
       ${COMMENTS_EACH_CHANGE}`,
    );
    const elsewhere = await report('OPS');
    const ours = await report('WEB');

    await move(elsewhere, 'inProgress');
    await move(ours, 'inProgress');
    await runJobs();

    expect(await commentsOn(elsewhere)).toStrictEqual([]);
    expect(await commentsOn(ours)).toHaveLength(1);
    expect(await pluginState('time-tracking')).toStrictEqual({ state: 'enabled', failures: 0 });
  });

  it('hears nothing while it is disabled', async () => {
    await install(listener(), COMMENTS_EACH_CHANGE);
    const key = await report('WEB');
    expect((await call('POST', '/api/v1/plugins/time-tracking/disable')).statusCode).toBe(204);

    await move(key, 'inProgress');
    await runJobs();

    expect(await commentsOn(key)).toStrictEqual([]);
  });

  it('may ask only what its needs allow', async () => {
    // It may comment, not read: its refusal says so on the issue.
    await install(
      listener({ needs: ['comment.create'] }),
      `const { issue, event } = JSON.parse(payload);
       const refusal = await __host.call('issues.get', JSON.stringify({ issueId: issue.id }))
         .then(() => 'read', (error) => error.message);
       await __host.call('issues.comment', JSON.stringify({ issueId: issue.id, body: refusal, once: event.id }));
       return JSON.stringify({ ok: true, result: null });`,
    );
    const key = await report('WEB');

    await move(key, 'inProgress');
    await runJobs();

    // Commenting takes seeing the issue: without issue.read, the comment is refused too.
    expect(await commentsOn(key)).toStrictEqual([]);
    expect((await pluginState('time-tracking'))?.failures).toBe(1);
  });

  it('is told of an issue deleted, by its id', async () => {
    const kept = await report('WEB');
    await install(
      listener({ events: ['issue.deleted'] }),
      `const { issue, event } = JSON.parse(payload);
       await __host.call('issues.comment', JSON.stringify({
         issueId: ${JSON.stringify(await issueIdOf(kept))},
         body: 'Gone: ' + issue.key + ' ' + issue.id,
         once: event.id,
       }));
       return JSON.stringify({ ok: true, result: null });`,
    );
    const gone = await report('WEB');
    const goneId = await issueIdOf(gone);

    expect((await call('DELETE', `/api/v1/issues/${gone}`)).statusCode).toBe(204);
    await runJobs();

    expect((await commentsOn(kept)).map(({ body }) => body)).toContain(`Gone: ${gone} ${goneId}`);
  });
});

describe('a plugin that keeps failing', () => {
  it('is disabled at its tenth failure in a row, and its managers emailed', async () => {
    await install(listener(), `throw new Error('Broken on purpose');`);
    const key = await report('WEB');
    await context.database.db
      .update(schema.plugins)
      .set({ failures: 9 })
      .where(eq(schema.plugins.slug, 'time-tracking'));
    const before = mail.received.length;

    await move(key, 'inProgress');
    await runJobs();

    expect(await pluginState('time-tracking')).toStrictEqual({ state: 'disabled', failures: 10 });
    const sent = mail.received.slice(before);
    expect(sent.map(({ to }) => to)).toStrictEqual([['ada@example.com']]);
    expect(sent[0]?.subject).toBe('Toppo stopped the plugin Time tracking');
    expect(sent[0]?.content).toContain('The last time, its code threw an error.');
    expect(sent[0]?.content).not.toContain('Broken on purpose');
  });

  it('counts its failures from zero again once it runs well, or is enabled again', async () => {
    await install(listener(), COMMENTS_EACH_CHANGE);
    const key = await report('WEB');
    const ofThePlugin = eq(schema.plugins.slug, 'time-tracking');
    await context.database.db.update(schema.plugins).set({ failures: 4 }).where(ofThePlugin);

    await move(key, 'inProgress');
    await runJobs();
    expect((await pluginState('time-tracking'))?.failures).toBe(0);

    await context.database.db
      .update(schema.plugins)
      .set({ failures: 10, state: 'disabled' })
      .where(and(ofThePlugin));
    expect((await call('POST', '/api/v1/plugins/time-tracking/enable')).statusCode).toBe(204);
    expect(await pluginState('time-tracking')).toStrictEqual({ state: 'enabled', failures: 0 });
  });
});
