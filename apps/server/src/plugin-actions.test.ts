import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { apiErrorSchema, createRoleResponseSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * A plugin's actions run for the person signed in: the access an action declares is checked
 * first, then the plugin runs with what both it and the person hold, and writes as itself. A
 * refusal of the plugin's answers in its own words; a plugin that fails answers 502, counted.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

const MANIFEST = testManifest({
  needs: ['issue.read', 'comment.create'],
  permissions: {
    'entries.log': { scope: 'project', label: 'permissions.log' },
    'reports.read': { scope: 'instance', label: 'permissions.reports' },
  },
  messages: { en: { permissions: { log: 'Log time', reports: 'Read reports' } }, fr: {} },
  actions: [
    { name: 'time.whoAsks', access: 'authenticated', input: {} },
    { name: 'time.log', access: { issue: 'issueId', permission: 'entries.log' }, input: {} },
    { name: 'time.comment', access: { issue: 'issueId' }, input: {} },
    { name: 'reports.read', access: { permission: 'reports.read' }, input: {} },
    { name: 'time.refuse', access: 'authenticated', input: {} },
    { name: 'time.crash', access: 'authenticated', input: {} },
  ],
  events: [],
});

/** Each action does what its name says, through Toppo's calls. */
const RUN = `
  const input = JSON.parse(payload);
  const asked = JSON.parse(context);
  const ok = (result) => JSON.stringify({ ok: true, result });
  switch (name) {
    case 'time.whoAsks':
      return ok({ user: asked.user.id, locale: asked.locale });
    case 'time.log':
    case 'time.comment': {
      const answer = await __host
        .call('issues.comment', JSON.stringify({ issueId: input.issueId, body: 'Logged ' + input.minutes + ' min' }))
        .then((comment) => JSON.parse(comment), (error) => ({ refused: error.message }));
      return ok(answer);
    }
    case 'reports.read':
      return ok('read');
    case 'time.refuse':
      return JSON.stringify({
        ok: false,
        error: { code: 'errors.tooMuch', params: { limit: 480 }, issues: [{ path: 'minutes', message: 'At most 480' }] },
      });
    default:
      throw new Error('Broken on purpose');
  }
`;

function call(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: unknown) {
  const headers = { origin: ORIGIN, cookie: cookies[who] ?? '' };
  return app.inject(
    body === undefined
      ? { method, url, headers }
      : {
          method,
          url,
          headers: { ...headers, 'content-type': 'application/json' },
          payload: JSON.stringify(body),
        },
  );
}

const act = (who: string, action: string, input: unknown = {}) =>
  call(who, 'POST', `/api/v1/plugins/time-tracking/actions/${action}`, input);

const errorOf = (response: LightMyRequestResponse) => apiErrorSchema.parse(response.json()).error;

async function signIn(who: string, email: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  cookies[who] = cookieHeader(response);
}

async function issueIn(projectKey: string, who = 'ada'): Promise<string> {
  const created = await call(who, 'POST', `/api/v1/projects/${projectKey}/issues`, {
    title: 'Invoices fail to download',
  });
  expect(created.statusCode, created.body).toBe(201);
  const key = created.json<{ key: string }>().key;
  const issue = await call('ada', 'GET', `/api/v1/issues/${key}`);
  return issue.json<{ id: string }>().id;
}

async function failures(): Promise<number | undefined> {
  const [plugin] = await context.database.db
    .select({ failures: schema.plugins.failures })
    .from(schema.plugins);
  return plugin?.failures;
}

async function commentsBy(issueId: string) {
  return await context.database.db
    .select({ body: schema.comments.body, author: schema.users.name })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.issueId, issueId));
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  await signIn('ada', 'ada@example.com');
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['OPS', 'Operations'],
  ]) {
    expect((await call('ada', 'POST', '/api/v1/projects', { key, name })).statusCode).toBe(201);
  }
  // Grace works in WEB with the team role; Vera there may read, not comment.
  const viewer = await call('ada', 'POST', '/api/v1/roles', { name: 'Viewer', color: 'gray' });
  const viewerId = createRoleResponseSchema.parse(viewer.json()).id;
  const roles = await call('ada', 'GET', '/api/v1/roles');
  const viewerPermissions = roles
    .json<{ roles: { id: string; permissions: string[] }[] }>()
    .roles.find(({ id }) => id === viewerId)?.permissions;
  expect(
    (
      await call('ada', 'PUT', '/api/v1/roles/permissions', {
        changes: [{ roleId: viewerId, from: viewerPermissions, to: ['issue.read'] }],
      })
    ).statusCode,
  ).toBe(204);
  for (const [who, email, roleId] of [
    ['grace', 'grace@example.com', DEFAULT_ROLE_IDS.team],
    ['vera', 'vera@example.com', viewerId],
  ] as const) {
    ids[who] = await createTestUser(context.database, {
      name: who,
      email,
      password: PASSWORD,
      instanceRoleId: roleId,
    });
    await signIn(who, email);
    const joined = await call('ada', 'POST', '/api/v1/projects/WEB/members', {
      userIds: [ids[who]],
      roleId: null,
    });
    expect(joined.statusCode, joined.body).toBe(204);
  }
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/zip' },
    payload: testPackage({ manifest: MANIFEST, run: RUN }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  const approved = await call('ada', 'POST', '/api/v1/plugins/time-tracking/approve', {
    projects: ['WEB'],
  });
  expect(approved.statusCode, approved.body).toBe(204);
  await context.database.db.update(schema.plugins).set({ failures: 0 });
});

describe('a plugin action', () => {
  it('runs for the person signed in, in their language, and answers its result', async () => {
    const response = await act('grace', 'time.whoAsks');

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toStrictEqual({ result: { user: ids['grace'], locale: 'en' } });
  });

  it('runs only for those its access lets in: 404 for an issue they or the plugin do not see', async () => {
    const ours = await issueIn('WEB');
    const elsewhere = await issueIn('OPS');

    expect(errorOf(await act('grace', 'time.log', { issueId: ours, minutes: 30 })).code).toBe(
      'FORBIDDEN',
    );
    const team = await call('ada', 'GET', '/api/v1/roles');
    const teamPermissions =
      team
        .json<{ roles: { id: string; permissions: string[] }[] }>()
        .roles.find(({ id }) => id === DEFAULT_ROLE_IDS.team)?.permissions ?? [];
    await call('ada', 'PUT', '/api/v1/roles/permissions', {
      changes: [
        {
          roleId: DEFAULT_ROLE_IDS.team,
          from: teamPermissions,
          to: [...teamPermissions, 'time-tracking.entries.log'],
        },
      ],
    });

    const logged = await act('grace', 'time.log', { issueId: ours, minutes: 30 });
    expect(logged.statusCode, logged.body).toBe(200);
    expect(await commentsBy(ours)).toStrictEqual([
      { body: 'Logged 30 min', author: 'Time tracking' },
    ]);
    for (const issueId of [elsewhere, 'not-an-id', '01a1569b-9900-7000-8000-00000000dead']) {
      const refused = await act('ada', 'time.log', { issueId, minutes: 30 });
      expect(refused.statusCode).toBe(404);
      expect(errorOf(refused).code).not.toBe('PLUGIN_ACTION_NOT_FOUND');
    }
  });

  it('holds what both the person and the plugin hold: commenting takes both', async () => {
    const issueId = await issueIn('WEB');

    const vera = await act('vera', 'time.comment', { issueId, minutes: 5 });
    const ada = await act('ada', 'time.comment', { issueId, minutes: 5 });

    expect(vera.json()).toStrictEqual({ result: { refused: 'FORBIDDEN' } });
    expect(ada.json()).toMatchObject({ result: { commentId: expect.any(String) } });
  });

  it('checks a permission of the whole instance against the person’s own role', async () => {
    expect((await act('grace', 'reports.read')).statusCode).toBe(403);
    expect((await act('ada', 'reports.read')).json()).toStrictEqual({ result: 'read' });
  });

  it('answers a refusal in the plugin’s own words, counting no failure', async () => {
    const refused = await act('grace', 'time.refuse', { minutes: 900 });

    expect(refused.statusCode).toBe(422);
    expect(errorOf(refused)).toStrictEqual({
      code: 'PLUGIN_REFUSED',
      message: 'The plugin refused',
      plugin: { code: 'errors.tooMuch', params: { limit: 480 } },
      details: [{ path: 'minutes', message: 'At most 480' }],
    });
    expect(await failures()).toBe(0);
  });

  it('answers 502 when the plugin fails, and counts it', async () => {
    const failed = await act('grace', 'time.crash');

    expect(failed.statusCode).toBe(502);
    expect(errorOf(failed).code).toBe('INTERNAL_ERROR');
    expect(await failures()).toBe(1);
  });

  it('is not found when the plugin does not declare it, or is not enabled', async () => {
    expect(errorOf(await act('grace', 'time.unknown')).code).toBe('PLUGIN_ACTION_NOT_FOUND');
    expect((await call('ada', 'POST', '/api/v1/plugins/time-tracking/disable')).statusCode).toBe(
      204,
    );

    const disabled = await act('grace', 'time.whoAsks');
    expect(disabled.statusCode).toBe(404);
    expect(errorOf(disabled).code).toBe('PLUGIN_ACTION_NOT_FOUND');
  });

  it('takes a JSON object of 64 KB at most', async () => {
    expect((await act('grace', 'time.whoAsks', [1, 2])).statusCode).toBe(400);
    expect((await act('grace', 'time.whoAsks', { text: 'x'.repeat(64 * 1024) })).statusCode).toBe(
      413,
    );
  });
});

describe('a plugin action’s access', () => {
  it('needs a session', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/time-tracking/actions/time.whoAsks',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      payload: '{}',
    });

    expect(anonymous.statusCode).toBe(401);
  });
});
