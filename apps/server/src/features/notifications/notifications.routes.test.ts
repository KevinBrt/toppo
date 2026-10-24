import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  addCommentResponseSchema,
  createIssueResponseSchema,
  notificationsResponseSchema,
  unreadNotificationsResponseSchema,
} from '@toppo/shared';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createJobs } from '../../app.ts';
import { runNextJob, type WorkerContext } from '../../platform/jobs/job-worker.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let worker: WorkerContext;
const cookies: Record<'ada' | 'grace' | 'alan' | 'rita', string> = {
  ada: '',
  grace: '',
  alan: '',
  rita: '',
};
const ids: Record<'ada' | 'grace' | 'alan' | 'rita', string> = {
  ada: '',
  grace: '',
  alan: '',
  rita: '',
};
type Person = keyof typeof cookies;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const IN_PROGRESS = DEFAULT_STATUSES.find(({ kind }) => kind === 'inProgress')?.id ?? '';

function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, who: Person, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: cookies[who] },
    ...(body ? { body } : {}),
  });
}

async function signIn(email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return cookieHeader(response);
}

async function report(who: Person, title = 'Empty CSV export'): Promise<string> {
  const response = await call('POST', '/api/v1/projects/WEB/issues', who, { title });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function assign(key: string, to: Person, by: Person = 'ada'): Promise<void> {
  const response = await call('PUT', `/api/v1/issues/${key}/assignee`, by, {
    assigneeId: ids[to],
  });
  expect(response.statusCode).toBe(204);
}

async function comment(key: string, who: Person): Promise<string> {
  const response = await call('POST', `/api/v1/issues/${key}/comments`, who, { body: 'Seen it.' });
  expect(response.statusCode).toBe(201);
  return addCommentResponseSchema.parse(response.json()).id;
}

/** Runs every job due: the notifications of what was just done arrive. */
async function deliver(): Promise<void> {
  while (await runNextJob(worker)) {
    // Until none is due.
  }
}

async function notificationsOf(who: Person) {
  const response = await call('GET', '/api/v1/notifications', who);
  expect(response.statusCode).toBe(200);
  return notificationsResponseSchema.parse(response.json());
}

/** What `who` was told about `key`, oldest first: `event` and who did it. */
async function toldAbout(who: Person, key: string) {
  return (await notificationsOf(who)).rows
    .filter(({ issue }) => issue.key === key)
    .map(({ event, actor, status }) => ({ event, by: actor.name, status }))
    .toReversed();
}

async function unread(who: Person): Promise<number> {
  const response = await call('GET', '/api/v1/notifications/unread-count', who);
  return unreadNotificationsResponseSchema.parse(response.json()).count;
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  worker = {
    db: context.database.db,
    jobs: createJobs({ files: await createTestFileStorage() }),
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
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  ids.grace = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  ids.alan = await person('Alan Turing', 'alan@example.com', DEFAULT_ROLE_IDS.team);
  ids.rita = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  for (const [who, email] of [
    ['ada', 'ada@example.com'],
    ['grace', 'grace@example.com'],
    ['alan', 'alan@example.com'],
    ['rita', 'rita@example.com'],
  ] as const) {
    cookies[who] = await signIn(email);
  }
  const me = (await call('GET', '/api/v1/me', 'ada')).json() as { user: { id: string } };
  ids.ada = me.user.id;
  expect(
    (await call('POST', '/api/v1/projects', 'ada', { key: 'WEB', name: 'Website' })).statusCode,
  ).toBe(201);
  const added = await call('POST', '/api/v1/projects/WEB/members', 'ada', {
    userIds: [ids.grace, ids.alan, ids.rita],
    roleId: null,
  });
  expect(added.statusCode).toBe(204);
  return () => app.close();
});

describe('notifications', () => {
  it('tell the person an issue is given to, never who gave it', async () => {
    const key = await report('ada');
    await assign(key, 'grace');
    await deliver();

    expect(await toldAbout('grace', key)).toStrictEqual([
      { event: 'assigned', by: 'Ada Lovelace', status: null },
    ]);
    expect(await toldAbout('ada', key)).toStrictEqual([]);
  });

  it('tell everyone involved of a new comment, but its author', async () => {
    const key = await report('rita');
    await assign(key, 'alan');
    await comment(key, 'grace');
    await deliver();
    await comment(key, 'rita');
    await deliver();

    expect(await toldAbout('rita', key)).toStrictEqual([
      { event: 'commented', by: 'Grace Hopper', status: null },
    ]);
    expect(await toldAbout('alan', key)).toStrictEqual([
      { event: 'assigned', by: 'Ada Lovelace', status: null },
      { event: 'commented', by: 'Grace Hopper', status: null },
      { event: 'commented', by: 'Rita Client', status: null },
    ]);
    expect(await toldAbout('grace', key)).toStrictEqual([
      { event: 'commented', by: 'Rita Client', status: null },
    ]);
    expect(await toldAbout('ada', key)).toStrictEqual([]);
  });

  it('tell the reporter and the assignee of a status change, and nobody of other changes', async () => {
    const key = await report('rita');
    await assign(key, 'alan');
    await deliver();
    expect(
      (await call('PUT', `/api/v1/issues/${key}/status`, 'grace', { statusId: IN_PROGRESS }))
        .statusCode,
    ).toBe(204);
    expect(
      (await call('PATCH', `/api/v1/issues/${key}`, 'grace', { title: 'Renamed' })).statusCode,
    ).toBe(204);
    await deliver();

    expect(await toldAbout('rita', key)).toStrictEqual([
      { event: 'statusChanged', by: 'Grace Hopper', status: 'In progress' },
    ]);
    expect((await toldAbout('alan', key)).map(({ event }) => event)).toStrictEqual([
      'assigned',
      'statusChanged',
    ]);
    expect((await notificationsOf('alan')).rows[0]?.issue.title).toBe('Renamed');
  });

  it('tell the people a comment names, once each, even when it is edited', async () => {
    const key = await report('ada');
    const named = await call('POST', `/api/v1/issues/${key}/comments`, 'grace', {
      body: '@Alan Turing, can you look?',
      mentions: [ids.alan],
    });
    expect(named.statusCode).toBe(201);
    const { id } = addCommentResponseSchema.parse(named.json());
    await deliver();
    const edited = await call('PATCH', `/api/v1/issues/${key}/comments/${id}`, 'grace', {
      body: '@Alan Turing, can you look? @Ada Lovelace too.',
      mentions: [ids.alan, ids.ada],
    });
    expect(edited.statusCode).toBe(204);
    await deliver();

    expect(await toldAbout('alan', key)).toStrictEqual([
      { event: 'mentioned', by: 'Grace Hopper', status: null },
    ]);
    expect(await toldAbout('ada', key)).toStrictEqual([
      { event: 'commented', by: 'Grace Hopper', status: null },
      { event: 'mentioned', by: 'Grace Hopper', status: null },
    ]);
  });

  it('tell nobody whose account is deactivated', async () => {
    const key = await report('ada');
    await assign(key, 'alan');
    await context.database.db
      .update(schema.users)
      .set({ deactivatedAt: sql`now()` })
      .where(eq(schema.users.id, ids.alan));
    await deliver();
    await context.database.db
      .update(schema.users)
      .set({ deactivatedAt: null })
      .where(eq(schema.users.id, ids.alan));

    expect(await toldAbout('alan', key)).toStrictEqual([]);
  });

  it('show only the issues one still sees, and leave with a deleted issue', async () => {
    const kept = await report('ada');
    const deleted = await report('ada');
    await assign(kept, 'grace');
    await assign(deleted, 'grace');
    await deliver();
    expect(await toldAbout('grace', kept)).toHaveLength(1);

    expect((await call('DELETE' as 'POST', `/api/v1/issues/${deleted}`, 'ada')).statusCode).toBe(
      204,
    );
    expect(await toldAbout('grace', deleted)).toStrictEqual([]);

    const before = await unread('grace');
    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/projects/WEB/members/${ids.grace}`,
      headers: { origin: ORIGIN, cookie: cookies.ada },
    });
    expect(removed.statusCode).toBe(204);
    expect(await toldAbout('grace', kept)).toStrictEqual([]);
    expect(await unread('grace')).toBe(0);
    expect(before).toBeGreaterThan(0);
    const back = await call('POST', '/api/v1/projects/WEB/members', 'ada', {
      userIds: [ids.grace],
      roleId: null,
    });
    expect(back.statusCode).toBe(204);
  });

  it('are marked read one by one or all at once, by their own person only', async () => {
    const key = await report('rita');
    await assign(key, 'alan');
    await comment(key, 'grace');
    await deliver();
    const [latest] = (await notificationsOf('alan')).rows;
    const unreadBefore = await unread('alan');

    expect(
      (await call('POST', '/api/v1/notifications/read', 'rita', { ids: [latest?.id] })).statusCode,
    ).toBe(204);
    expect(await unread('alan')).toBe(unreadBefore);
    expect(
      (await call('POST', '/api/v1/notifications/read', 'alan', { ids: [latest?.id] })).statusCode,
    ).toBe(204);
    expect(await unread('alan')).toBe(unreadBefore - 1);
    expect((await notificationsOf('alan')).rows[0]?.readAt).not.toBeNull();

    expect(
      (await call('POST', '/api/v1/notifications/read', 'alan', { all: true })).statusCode,
    ).toBe(204);
    expect(await unread('alan')).toBe(0);
    expect(await unread('rita')).toBeGreaterThan(0);
    expect((await call('POST', '/api/v1/notifications/read', 'alan', { ids: [] })).statusCode).toBe(
      400,
    );
  });

  it('read 90 days ago leave, unread ones stay', async () => {
    const key = await report('ada');
    await assign(key, 'grace');
    await comment(key, 'alan');
    await deliver();
    const [newest, oldest] = (await notificationsOf('grace')).rows.filter(
      ({ issue }) => issue.key === key,
    );
    await context.database.db
      .update(schema.notifications)
      .set({ readAt: sql`now() - interval '91 days'` })
      .where(eq(schema.notifications.id, oldest?.id ?? ''));
    await context.database.db
      .update(schema.notifications)
      .set({ createdAt: sql`now() - interval '200 days'` })
      .where(eq(schema.notifications.id, newest?.id ?? ''));

    const prune = worker.jobs.find(({ type }) => type === 'notifications.prune');
    await context.database.db.insert(schema.jobs).values({ type: prune?.type ?? '' });
    await deliver();

    expect((await notificationsOf('grace')).rows.map(({ id }) => id)).toContain(newest?.id);
    expect((await notificationsOf('grace')).rows.map(({ id }) => id)).not.toContain(oldest?.id);
  });
});
