import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import type { FastifyInstance } from 'fastify';
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
 * A plugin's records are its own, kept by Toppo: checked by Toppo as each entity declares, within
 * their limits, and seen as their issue or project is, by the plugin and whoever it acts for.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

const MANIFEST = testManifest({
  needs: ['issue.read'],
  entities: {
    timeEntry: {
      attachedTo: 'issue',
      fields: {
        type: 'object',
        properties: {
          minutes: { type: 'integer', minimum: 1, maximum: 1440 },
          note: { type: 'string', maxLength: 50 },
        },
        required: ['minutes'],
      },
      limits: { perIssue: 3 },
    },
    budget: {
      attachedTo: 'project',
      fields: {
        type: 'object',
        properties: { days: { type: 'number', exclusiveMinimum: 0 } },
        required: ['days'],
      },
      limits: {},
    },
  },
  actions: [{ name: 'records.ask', access: 'authenticated', input: {} }],
  events: [],
});

/** Asks Toppo what the input says, as is: Toppo checks it all itself. */
const RUN = `
  const { method, args } = JSON.parse(payload);
  const answer = await __host
    .call(method, JSON.stringify(args))
    .then((answered) => ({ answer: JSON.parse(answered) }), (error) => ({ refused: error.message }));
  return JSON.stringify({ ok: true, result: answer });
`;

function call(who: string, method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) {
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

/** What Toppo answers the plugin's call, run for `who`. */
async function asks(
  who: string,
  method: string,
  args: Record<string, unknown>,
): Promise<{ answer?: unknown; refused?: string }> {
  const response = await call(who, 'POST', '/api/v1/plugins/time-tracking/actions/records.ask', {
    method,
    args,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ result: { answer?: unknown; refused?: string } }>().result;
}

async function answered<T>(who: string, method: string, args: Record<string, unknown>) {
  const reply = await asks(who, method, args);
  expect(reply.refused).toBeUndefined();
  return reply.answer as T;
}

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

async function issueIn(projectKey: string): Promise<string> {
  const created = await call('ada', 'POST', `/api/v1/projects/${projectKey}/issues`, {
    title: 'Invoices fail to download',
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ id: string }>().id;
}

async function install(): Promise<void> {
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/zip' },
    payload: testPackage({ manifest: MANIFEST, run: RUN }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
}

async function approve(projects: 'all' | string[]): Promise<void> {
  const approved = await call('ada', 'POST', '/api/v1/plugins/time-tracking/approve', {
    projects,
  });
  expect(approved.statusCode, approved.body).toBe(204);
}

const entry = (issueId: string, fields: Record<string, unknown>) => ({
  entity: 'timeEntry',
  issueId,
  fields,
});

interface Kept {
  id: string;
  issueId: string | null;
  projectId: string;
  createdBy: string | null;
  fields: Record<string, unknown>;
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
  ] as const) {
    const created = await call('ada', 'POST', '/api/v1/projects', { key, name });
    expect(created.statusCode).toBe(201);
    ids[key] = created.json<{ id: string }>().id;
  }
  // Grace works in WEB only, with the team role.
  ids['grace'] = await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  await signIn('grace', 'grace@example.com');
  const joined = await call('ada', 'POST', '/api/v1/projects/WEB/members', {
    userIds: [ids['grace']],
    roleId: null,
  });
  expect(joined.statusCode, joined.body).toBe(204);
  await install();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await context.database.db.delete(schema.pluginRecords);
  await approve('all');
});

describe('a plugin’s records', () => {
  it('are kept on an issue, written by whoever it acts for, read, changed and deleted', async () => {
    const issueId = await issueIn('WEB');

    const kept = await answered<Kept>('grace', 'entities.create', entry(issueId, { minutes: 90 }));
    const changed = await answered<Kept>('grace', 'entities.update', {
      entity: 'timeEntry',
      id: kept.id,
      fields: { note: 'Review' },
    });

    expect(kept).toMatchObject({
      issueId,
      projectId: ids['WEB'],
      createdBy: ids['grace'],
      fields: { minutes: 90 },
    });
    expect(changed.fields).toStrictEqual({ minutes: 90, note: 'Review' });
    expect(await answered('grace', 'entities.get', { entity: 'timeEntry', id: kept.id })).toEqual(
      changed,
    );
    expect(await answered('grace', 'entities.delete', { entity: 'timeEntry', id: kept.id })).toBe(
      null,
    );
    expect(await answered('grace', 'entities.get', { entity: 'timeEntry', id: kept.id })).toBe(
      null,
    );
  });

  it('are checked by Toppo as their entity declares them, whatever the plugin lets through', async () => {
    const issueId = await issueIn('WEB');

    for (const fields of [{ minutes: 0 }, { minutes: 90, hours: 1 }, { note: 'Review' }]) {
      expect(await asks('ada', 'entities.create', entry(issueId, fields))).toStrictEqual({
        refused: 'RECORD_INVALID',
      });
    }
    expect(
      await asks('ada', 'entities.create', entry(issueId, { minutes: 5, note: 'x'.repeat(51) })),
    ).toStrictEqual({ refused: 'RECORD_INVALID' });
    expect(
      await asks('ada', 'entities.create', { entity: 'budget', issueId, fields: { days: 2 } }),
    ).toStrictEqual({ refused: 'RECORD_INVALID' });
    expect(
      await asks('ada', 'entities.create', { entity: 'estimate', issueId, fields: {} }),
    ).toStrictEqual({ refused: 'ENTITY_NOT_FOUND' });
    expect(
      await asks('ada', 'entities.aggregate', { entity: 'timeEntry', op: 'sum', field: 'note' }),
    ).toStrictEqual({ refused: 'RECORD_INVALID' });
  });

  it('stop at the limit of their entity on each issue', async () => {
    const issueId = await issueIn('WEB');
    for (const minutes of [10, 20, 30]) {
      await answered('ada', 'entities.create', entry(issueId, { minutes }));
    }

    expect(await asks('ada', 'entities.create', entry(issueId, { minutes: 40 }))).toStrictEqual({
      refused: 'RECORD_LIMIT_REACHED',
    });
    // Another issue holds its own.
    await answered('ada', 'entities.create', entry(await issueIn('WEB'), { minutes: 40 }));
  });

  it('are seen, counted and summed as their issue is, by whoever the plugin acts for', async () => {
    const ours = await issueIn('WEB');
    const theirs = await issueIn('OPS');
    await answered('ada', 'entities.create', entry(ours, { minutes: 30 }));
    const hidden = await answered<Kept>('ada', 'entities.create', entry(theirs, { minutes: 60 }));

    // Grace works in WEB only; Ada reaches every project.
    expect(await answered('grace', 'entities.list', { entity: 'timeEntry' })).toMatchObject({
      items: [{ issueId: ours }],
      total: 1,
    });
    expect(
      await answered('grace', 'entities.aggregate', {
        entity: 'timeEntry',
        op: 'sum',
        field: 'minutes',
        groupBy: 'projectId',
      }),
    ).toStrictEqual({ total: 30, groups: [{ key: ids['WEB'], value: 30 }] });
    expect(await answered('grace', 'entities.get', { entity: 'timeEntry', id: hidden.id })).toBe(
      null,
    );
    expect(
      await asks('grace', 'entities.update', {
        entity: 'timeEntry',
        id: hidden.id,
        fields: { minutes: 1 },
      }),
    ).toStrictEqual({ refused: 'RECORD_NOT_FOUND' });
    expect(
      await answered('ada', 'entities.aggregate', {
        entity: 'timeEntry',
        op: 'count',
        groupBy: 'issueId',
      }),
    ).toStrictEqual({
      total: 2,
      groups: [
        { key: expect.any(String), value: 1 },
        { key: expect.any(String), value: 1 },
      ],
    });
    expect(
      await answered('ada', 'entities.list', {
        entity: 'timeEntry',
        where: { projectId: ids['OPS'] },
        order: 'oldest',
      }),
    ).toMatchObject({ items: [{ id: hidden.id }], total: 1 });
  });

  it('are seen in the projects the plugin acts in only', async () => {
    const theirs = await issueIn('OPS');
    const kept = await answered<Kept>('ada', 'entities.create', entry(theirs, { minutes: 60 }));

    await approve(['WEB']);

    expect(await asks('ada', 'entities.create', entry(theirs, { minutes: 5 }))).toStrictEqual({
      refused: 'PROJECT_NOT_FOUND',
    });
    expect(await answered('ada', 'entities.get', { entity: 'timeEntry', id: kept.id })).toBe(null);
    expect(await answered('ada', 'entities.list', { entity: 'timeEntry' })).toStrictEqual({
      items: [],
      total: 0,
    });
  });

  it('may hang on a project, seen by those who reach it', async () => {
    const kept = await answered<Kept>('ada', 'entities.create', {
      entity: 'budget',
      projectId: ids['WEB'],
      fields: { days: 22.5 },
    });
    await answered('ada', 'entities.create', {
      entity: 'budget',
      projectId: ids['OPS'],
      fields: { days: 10 },
    });

    expect(kept).toMatchObject({ issueId: null, projectId: ids['WEB'], fields: { days: 22.5 } });
    expect(
      await answered('grace', 'entities.aggregate', { entity: 'budget', op: 'sum', field: 'days' }),
    ).toStrictEqual({ total: 22.5 });
    expect(
      await asks('grace', 'entities.create', {
        entity: 'budget',
        projectId: ids['OPS'],
        fields: { days: 1 },
      }),
    ).toStrictEqual({ refused: 'PROJECT_NOT_FOUND' });
  });

  it('are read-only in an archived project', async () => {
    const issueId = await issueIn('WEB');
    const kept = await answered<Kept>('ada', 'entities.create', entry(issueId, { minutes: 5 }));
    expect((await call('ada', 'POST', '/api/v1/projects/WEB/archive')).statusCode).toBe(204);

    try {
      expect(await asks('ada', 'entities.create', entry(issueId, { minutes: 5 }))).toStrictEqual({
        refused: 'PROJECT_ARCHIVED',
      });
      expect(
        await asks('ada', 'entities.delete', { entity: 'timeEntry', id: kept.id }),
      ).toStrictEqual({ refused: 'PROJECT_ARCHIVED' });
      expect(
        await answered('ada', 'entities.get', { entity: 'timeEntry', id: kept.id }),
      ).toMatchObject({ id: kept.id });
    } finally {
      expect((await call('ada', 'POST', '/api/v1/projects/WEB/unarchive')).statusCode).toBe(204);
    }
  });

  it('stay when the plugin is uninstalled keeping them, found again as it comes back', async () => {
    const kept = await answered<Kept>(
      'ada',
      'entities.create',
      entry(await issueIn('WEB'), { minutes: 5 }),
    );

    expect(
      (await call('ada', 'DELETE', '/api/v1/plugins/time-tracking?data=keep')).statusCode,
    ).toBe(204);
    await install();
    await approve('all');
    expect(
      await answered('ada', 'entities.get', { entity: 'timeEntry', id: kept.id }),
    ).toMatchObject({
      id: kept.id,
    });

    expect(
      (await call('ada', 'DELETE', '/api/v1/plugins/time-tracking?data=delete')).statusCode,
    ).toBe(204);
    expect(await context.database.db.select().from(schema.pluginRecords)).toStrictEqual([]);
    await install();
  });
});
