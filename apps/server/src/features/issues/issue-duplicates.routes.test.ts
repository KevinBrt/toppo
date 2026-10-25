import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES } from '@toppo/core';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueResponseSchema,
} from '@toppo/shared';
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
type Person = 'ada' | 'grace' | 'rita';
/** Ada administers; Grace is on the team of WEB and API, not of SECRET; Rita reports. */
const cookies: Record<Person, string> = { ada: '', grace: '', rita: '' };

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const statusOf = (kind: string) =>
  DEFAULT_STATUSES.find((status) => status.kind === kind)?.id ?? '';
const RESOLVED = statusOf('resolved');
const IN_PROGRESS = statusOf('inProgress');

function call(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  who: Person | null,
  body?: object,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) },
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

async function report(project = 'WEB', who: Person = 'ada', title = 'Export is empty') {
  const response = await call('POST', `/api/v1/projects/${project}/issues`, who, { title });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

const mark = (key: string, originalKey: string, who: Person | null = 'ada', statusId = RESOLVED) =>
  call('PUT', `/api/v1/issues/${key}/duplicate-of`, who, { originalKey, statusId });

async function issue(key: string, who: Person = 'ada') {
  const response = await call('GET', `/api/v1/issues/${key}`, who);
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json());
}

async function history(key: string, who: Person = 'ada') {
  const response = await call('GET', `/api/v1/issues/${key}/activities`, who);
  return issueActivitiesResponseSchema.parse(response.json()).rows;
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
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  const grace = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  const rita = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  cookies.ada = await signIn('ada@example.com');
  cookies.grace = await signIn('grace@example.com');
  cookies.rita = await signIn('rita@example.com');
  for (const [key, members] of [
    ['WEB', [grace, rita]],
    ['API', [grace, rita]],
    ['OLD', [grace, rita]],
    ['SECRET', []],
  ] as const) {
    expect((await call('POST', '/api/v1/projects', 'ada', { key, name: key })).statusCode).toBe(
      201,
    );
    if (members.length > 0) {
      const added = await call('POST', `/api/v1/projects/${key}/members`, 'ada', {
        userIds: members,
        roleId: null,
      });
      expect(added.statusCode).toBe(204);
    }
  }
  return () => app.close();
});

describe('a duplicate', () => {
  it('is closed at once, and each issue shows the other', async () => {
    const original = await report('API', 'ada', 'Export fails');
    const duplicate = await report('WEB', 'grace');

    expect((await mark(duplicate, original)).statusCode).toBe(204);

    const marked = await issue(duplicate);
    expect(marked.status.id).toBe(RESOLVED);
    expect(marked.closedAt).not.toBeNull();
    expect(marked.duplicateOf).toMatchObject({
      key: original,
      title: 'Export fails',
      status: { name: 'New', closes: false },
    });
    expect(await issue(original)).toMatchObject({
      duplicateOf: null,
      duplicates: [{ key: duplicate, title: 'Export is empty', status: { id: RESOLVED } }],
      duplicateCount: 1,
    });
    const [markedNow, moved] = await history(duplicate);
    expect(markedNow).toMatchObject({
      type: 'issue.duplicateChanged',
      payload: { from: null, to: { key: original, title: 'Export fails' } },
    });
    expect(moved?.type).toBe('issue.statusChanged');
  });

  it('has its reporter follow the original', async () => {
    const original = await report();
    const duplicate = await report('WEB', 'grace');
    expect((await issue(original, 'grace')).following).toBe(false);

    expect((await mark(duplicate, original)).statusCode).toBe(204);

    expect((await issue(original, 'grace')).following).toBe(true);
  });

  it('closes in a closing status only, and keeps the one it is closed in', async () => {
    const original = await report();
    const duplicate = await report();

    const open = await mark(duplicate, original, 'ada', IN_PROGRESS);
    expect(open.statusCode).toBe(409);
    expect(errorCode(open)).toBe('STATUS_NOT_ALLOWED');
    expect((await issue(duplicate)).duplicateOf).toBeNull();

    expect(
      (await call('PUT', `/api/v1/issues/${duplicate}/status`, 'ada', { statusId: RESOLVED }))
        .statusCode,
    ).toBe(204);
    expect((await mark(duplicate, original)).statusCode).toBe(204);
    expect((await history(duplicate)).map(({ type }) => type)).toStrictEqual([
      'issue.duplicateChanged',
      'issue.statusChanged',
      'issue.created',
    ]);
    expect((await mark(duplicate, original)).statusCode).toBe(204);
    expect(await history(duplicate)).toHaveLength(3);
  });

  it('is of an issue one sees, never of itself nor in a loop', async () => {
    const first = await report();
    const second = await report();
    const third = await report();
    const hidden = await report('SECRET');

    const unseen = await mark(first, hidden, 'grace');
    expect(unseen.statusCode).toBe(400);
    expect(errorCode(unseen)).toBe('ORIGINAL_NOT_FOUND');
    expect(errorCode(await mark(first, 'WEB-999'))).toBe('ORIGINAL_NOT_FOUND');
    expect(errorCode(await mark(first, first))).toBe('DUPLICATE_CYCLE');

    expect((await mark(first, second)).statusCode).toBe(204);
    expect((await mark(second, third)).statusCode).toBe(204);
    const loop = await mark(third, first);
    expect(loop.statusCode).toBe(409);
    expect(errorCode(loop)).toBe('DUPLICATE_CYCLE');
  });

  it('is no longer one once the mark is taken off, its status left as it is', async () => {
    const original = await report();
    const duplicate = await report();
    expect((await mark(duplicate, original)).statusCode).toBe(204);

    const taken = await call('DELETE', `/api/v1/issues/${duplicate}/duplicate-of`, 'grace');
    expect(taken.statusCode).toBe(204);
    expect(
      (await call('DELETE', `/api/v1/issues/${duplicate}/duplicate-of`, 'grace')).statusCode,
    ).toBe(204);

    const unmarked = await issue(duplicate);
    expect(unmarked.duplicateOf).toBeNull();
    expect(unmarked.status.id).toBe(RESOLVED);
    expect((await issue(original)).duplicateCount).toBe(0);
    expect((await history(duplicate))[0]).toMatchObject({
      type: 'issue.duplicateChanged',
      payload: { from: { key: original }, to: null },
    });
  });

  it('names an original out of the reader’s sight by nothing', async () => {
    const original = await report();
    const own = await report('WEB', 'rita');
    expect((await mark(own, original)).statusCode).toBe(204);

    expect((await issue(own, 'rita')).duplicateOf).toStrictEqual({
      key: null,
      title: null,
      status: null,
    });
    expect((await history(own, 'rita'))[0]).toMatchObject({
      payload: { to: { key: null, title: null } },
    });
  });

  it('needs to change the issue, on an open project', async () => {
    const original = await report();
    const own = await report('WEB', 'rita');
    const old = await report('OLD');
    expect((await call('POST', '/api/v1/projects/OLD/archive', 'ada')).statusCode).toBe(204);

    expect((await mark(own, original, 'rita')).statusCode).toBe(403);
    expect((await call('DELETE', `/api/v1/issues/${own}/duplicate-of`, 'rita')).statusCode).toBe(
      403,
    );
    expect((await mark(own, original, null)).statusCode).toBe(401);
    expect((await mark('WEB-999', original)).statusCode).toBe(404);
    expect(errorCode(await mark(old, original))).toBe('PROJECT_ARCHIVED');
    expect(
      (await call('PUT', `/api/v1/issues/${own}/duplicate-of`, 'ada', { originalKey: 'web 1' }))
        .statusCode,
    ).toBe(400);
  });
});
