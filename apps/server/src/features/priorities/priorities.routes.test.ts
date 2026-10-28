import { DEFAULT_PRIORITIES, DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import {
  apiErrorSchema,
  issueResponseSchema,
  type PriorityDraft,
  prioritiesResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
/** Team: works on issues, never on the settings. */
let teamCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const UNKNOWN_ID = '01a1569b-9900-7000-8000-00000000dead';

function idOf(kind: string): string {
  const found = DEFAULT_PRIORITIES.find((priority) => priority.kind === kind);
  if (!found) {
    throw new Error(`No default ${kind}`);
  }
  return found.id;
}

const LOW = idOf('low');
const NORMAL = idOf('normal');
const HIGH = idOf('high');
const URGENT = idOf('urgent');

function call(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: LightMyRequestResponse) =>
  apiErrorSchema.parse(response.json()).error.code;

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

async function priorities() {
  const response = await call('GET', '/api/v1/priorities', adminCookie);
  expect(response.statusCode).toBe(200);
  return prioritiesResponseSchema.parse(response.json()).priorities;
}

/** The four levels as stored now, changed by `change`, ready to send back. */
async function levels(change: (level: PriorityDraft) => PriorityDraft = (level) => level) {
  return (await priorities()).map(({ id, name, isDefault }) => change({ id, name, isDefault }));
}

const save = (list: PriorityDraft[]) =>
  call('PUT', '/api/v1/priorities', adminCookie, { priorities: list });

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
  await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  return () => app.close();
});

describe('priorities routes', () => {
  it.each(['GET', 'PUT'] as const)(
    '%s needs a session, then the settings permission',
    async (method) => {
      const anonymous = await call(method, '/api/v1/priorities', '', {});
      const member = await call(method, '/api/v1/priorities', teamCookie, {});

      expect(anonymous.statusCode).toBe(401);
      expect(member.statusCode).toBe(403);
      expect(errorCode(member)).toBe('FORBIDDEN');
    },
  );

  it('lists the four levels, lowest first, Normal for new issues', async () => {
    expect(
      (await priorities()).map(({ name, level, isDefault }) => [name, level, isDefault]),
    ).toStrictEqual([
      ['Low', 1, false],
      ['Normal', 2, true],
      ['High', 3, false],
      ['Urgent', 4, false],
    ]);
  });
});

describe('saving the priorities', () => {
  it('renames the levels and chooses the default at once', async () => {
    const response = await save(
      await levels((level) => ({
        ...level,
        name: level.id === HIGH ? ' Important ' : level.name,
        isDefault: level.id === URGENT,
      })),
    );

    expect(response.statusCode).toBe(204);
    expect((await priorities()).map(({ name, isDefault }) => [name, isDefault])).toStrictEqual([
      ['Low', false],
      ['Normal', false],
      ['Important', false],
      ['Urgent', true],
    ]);
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Web' })).statusCode,
    ).toBe(201);
    expect(
      (await call('POST', '/api/v1/projects/WEB/issues', adminCookie, { title: 'Site down' }))
        .statusCode,
    ).toBe(201);
    const issue = await call('GET', '/api/v1/issues/WEB-1', adminCookie);
    expect(issueResponseSchema.parse(issue.json()).priority.id).toBe(URGENT);
  });

  it('lets two levels swap their names', async () => {
    const swapped: Record<string, string> = { [LOW]: 'Normal', [NORMAL]: 'Low' };
    const response = await save(
      await levels((level) => ({ ...level, name: swapped[level.id] ?? level.name })),
    );

    expect(response.statusCode).toBe(204);
    expect((await priorities()).slice(0, 2).map(({ name }) => name)).toStrictEqual([
      'Normal',
      'Low',
    ]);
  });

  it('refuses a level that does not exist, a blank name, or one another level has', async () => {
    const unknown = await save(
      await levels((level) => (level.id === LOW ? { ...level, id: UNKNOWN_ID } : level)),
    );
    const blank = await save(await levels((level) => ({ ...level, name: ' ' })));
    const shared = await save(await levels((level) => ({ ...level, name: 'Same' })));

    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('PRIORITY_NOT_FOUND');
    expect(blank.statusCode).toBe(400);
    expect(shared.statusCode).toBe(400);
  });
});
