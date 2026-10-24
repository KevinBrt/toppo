import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  addCommentResponseSchema,
  createIssueResponseSchema,
  NOTIFICATION_EVENTS,
  type NotificationEvent,
  notificationsResponseSchema,
  unreadNotificationsResponseSchema,
} from '@toppo/shared';
import { startSmtpServer, type TestSmtpServer } from '@toppo/testing';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  // Each issue reported here would tell the team: only the tests about new issues want that.
  await context.database.db.update(schema.roles).set({ notifyNewIssues: false });
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

describe('new issues', () => {
  beforeAll(async () => {
    await context.database.db
      .update(schema.roles)
      .set({ notifyNewIssues: true })
      .where(inArray(schema.roles.id, [DEFAULT_ROLE_IDS.administrator, DEFAULT_ROLE_IDS.team]));
  });

  afterAll(async () => {
    await context.database.db.update(schema.roles).set({ notifyNewIssues: false });
  });

  it('tell the roles that ask for it, never the reporter nor those who cannot see the issue', async () => {
    const byRita = await report('rita');
    const byGrace = await report('grace');
    await deliver();

    expect(await toldAbout('ada', byRita)).toStrictEqual([
      { event: 'created', by: 'Rita Client', status: null },
    ]);
    expect(await toldAbout('alan', byGrace)).toStrictEqual([
      { event: 'created', by: 'Grace Hopper', status: null },
    ]);
    expect(await toldAbout('grace', byGrace)).toStrictEqual([]);
    // A requester sees only the issues she reported, and her role does not ask for others.
    expect(await toldAbout('rita', byGrace)).toStrictEqual([]);
  });

  it('tell whoever a new issue is given to that it is theirs', async () => {
    const response = await call('POST', '/api/v1/projects/WEB/issues', 'ada', {
      title: 'Broken export',
      assigneeId: ids.alan,
    });
    expect(response.statusCode).toBe(201);
    const { key } = createIssueResponseSchema.parse(response.json());
    await deliver();

    expect(await toldAbout('alan', key)).toStrictEqual([
      { event: 'assigned', by: 'Ada Lovelace', status: null },
    ]);
    expect(await toldAbout('grace', key)).toStrictEqual([
      { event: 'created', by: 'Ada Lovelace', status: null },
    ]);
  });

  it('follow the role a project gives, and a role turned off', async () => {
    // In WEB, Alan works as a requester: he is told of nothing he does not report.
    await context.database.db
      .update(schema.projectMembers)
      .set({ roleId: DEFAULT_ROLE_IDS.requester })
      .where(eq(schema.projectMembers.userId, ids.alan));
    await context.database.db
      .update(schema.roles)
      .set({ notifyNewIssues: false })
      .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.administrator));
    const key = await report('grace');
    await deliver();
    await context.database.db
      .update(schema.projectMembers)
      .set({ roleId: null })
      .where(eq(schema.projectMembers.userId, ids.alan));
    await context.database.db
      .update(schema.roles)
      .set({ notifyNewIssues: true })
      .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.administrator));

    expect(await toldAbout('alan', key)).toStrictEqual([]);
    expect(await toldAbout('ada', key)).toStrictEqual([]);
  });
});

describe('notification emails', () => {
  let mailServer: TestSmtpServer;

  const mailsTo = (who: Person) =>
    mailServer.received.filter(({ to }) => to.includes(`${who}@example.com`));

  /** The emails of the notifications made so far, as if their few minutes had passed. */
  async function deliverLater(): Promise<void> {
    await context.database.db
      .update(schema.jobs)
      .set({ runAt: sql`now()` })
      .where(and(eq(schema.jobs.type, 'notification.email'), eq(schema.jobs.status, 'pending')));
    await deliver();
  }

  async function setEmails(who: Person, emailed: readonly NotificationEvent[]): Promise<void> {
    const response = await call('PUT', '/api/v1/me/email-notifications', who, { emailed });
    expect(response.statusCode).toBe(204);
  }

  beforeAll(async () => {
    mailServer = await startSmtpServer();
    await context.database.db.insert(schema.mailSettings).values({
      host: '127.0.0.1',
      port: mailServer.port,
      security: 'none',
      fromAddress: 'toppo@example.com',
      fromName: 'Toppo',
    });
  });

  afterAll(async () => {
    await context.database.db.delete(schema.mailSettings);
    await mailServer.close();
  });

  it('leave a few minutes after the notification, saying what it says', async () => {
    const key = await report('ada');
    const before = mailsTo('grace').length;
    await assign(key, 'grace');
    await deliver();
    expect(mailsTo('grace')).toHaveLength(before);
    const [queued] = await context.database.db
      .select({ late: sql<boolean>`${schema.jobs.runAt} > now() + interval '4 minutes'` })
      .from(schema.jobs)
      .where(eq(schema.jobs.type, 'notification.email'));
    expect(queued?.late).toBe(true);

    await deliverLater();

    const mail = mailsTo('grace').at(-1);
    expect(mail?.subject).toBe(`[${key}] Empty CSV export`);
    expect(mail?.content).toContain(`Ada Lovelace assigned you ${key}`);
    expect(mail?.content).toContain(`http://localhost:3000/issues/${key}`);
  });

  it('do not leave once read in Toppo, nor of the kinds turned off', async () => {
    const key = await report('ada');
    await assign(key, 'grace');
    await deliver();
    expect(
      (await call('POST', '/api/v1/notifications/read', 'grace', { all: true })).statusCode,
    ).toBe(204);
    // Alan hears of comments by email, not of what is given to him.
    await setEmails(
      'alan',
      NOTIFICATION_EVENTS.filter((event) => event !== 'assigned'),
    );
    await assign(key, 'alan');
    await deliver();
    await comment(key, 'grace');
    await deliver();
    const before = { grace: mailsTo('grace').length, alan: mailsTo('alan').length };

    await deliverLater();
    await setEmails('alan', NOTIFICATION_EVENTS);

    expect(mailsTo('grace')).toHaveLength(before.grace);
    expect(
      mailsTo('alan')
        .slice(before.alan)
        .map(({ content }) => content.includes(`Grace Hopper commented on ${key}`)),
    ).toStrictEqual([true]);
  });

  it('quote the comment, in the language of whoever receives them', async () => {
    await context.database.db
      .update(schema.users)
      .set({ locale: 'fr' })
      .where(eq(schema.users.id, ids.rita));
    const key = await report('rita');
    const said = await call('POST', `/api/v1/issues/${key}/comments`, 'grace', {
      body: 'Corrigé dans la <b>1.3</b>.',
    });
    expect(said.statusCode).toBe(201);
    await deliver();

    await deliverLater();
    await context.database.db
      .update(schema.users)
      .set({ locale: 'en' })
      .where(eq(schema.users.id, ids.rita));

    const mail = mailsTo('rita').at(-1);
    expect(mail?.content).toContain(`Grace Hopper a commenté ${key}`);
    expect(mail?.content).toContain('Corrigé dans la <b>1.3</b>.');
    expect(mail?.content).toContain('Corrigé dans la &lt;b&gt;1.3&lt;/b&gt;.');
    expect(mail?.content).toContain(
      'désactivez-les dans votre compte : http://localhost:3000/account',
    );
  });

  it('quote the description of a new issue', async () => {
    await context.database.db
      .update(schema.roles)
      .set({ notifyNewIssues: true })
      .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.team));
    const response = await call('POST', '/api/v1/projects/WEB/issues', 'rita', {
      title: 'Invoices fail to download',
      description: 'Since this morning, every invoice answers an error.',
    });
    expect(response.statusCode).toBe(201);
    const { key } = createIssueResponseSchema.parse(response.json());
    await deliver();

    await deliverLater();
    await context.database.db.update(schema.roles).set({ notifyNewIssues: false });

    const mail = mailsTo('grace').at(-1);
    expect(mail?.subject).toBe(`[${key}] Invoices fail to download`);
    expect(mail?.content).toContain(`Rita Client created ${key}`);
    expect(mail?.content).toContain('Since this morning, every invoice answers an error.');
  });

  it('are not queued while email is off', async () => {
    await context.database.db.delete(schema.mailSettings);
    await context.database.db.delete(schema.jobs).where(eq(schema.jobs.type, 'notification.email'));
    const key = await report('ada');

    await assign(key, 'grace');
    await deliver();

    expect(
      await context.database.db
        .select()
        .from(schema.jobs)
        .where(eq(schema.jobs.type, 'notification.email')),
    ).toStrictEqual([]);
    expect(await toldAbout('grace', key)).toHaveLength(1);
  });
});
