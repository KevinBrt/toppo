import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueResponseSchema,
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
const cookies: Record<'ada' | 'grace' | 'rita', string> = { ada: '', grace: '', rita: '' };
type Person = keyof typeof cookies;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST' | 'PUT', url: string, who: Person | null, body?: object) {
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

async function report(project: string, who: Person = 'ada'): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${project}/issues`, who, {
    title: 'Crash on phones',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

const follow = (key: string, following: boolean, who: Person = 'ada') =>
  call('PUT', `/api/v1/issues/${key}/following`, who, { following });

/** Whether `who` follows the issue, as its page shows it. */
async function followingOf(key: string, who: Person) {
  const response = await call('GET', `/api/v1/issues/${key}`, who);
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json()).following;
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
  const members = [
    await createTestUser(context.database, {
      name: 'Grace Hopper',
      email: 'grace@example.com',
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    }),
    await createTestUser(context.database, {
      name: 'Rita Client',
      email: 'rita@example.com',
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.requester,
    }),
  ];
  cookies.ada = await signIn('ada@example.com');
  cookies.grace = await signIn('grace@example.com');
  cookies.rita = await signIn('rita@example.com');
  for (const key of ['WEB', 'OLD']) {
    expect((await call('POST', '/api/v1/projects', 'ada', { key, name: key })).statusCode).toBe(
      201,
    );
    const added = await call('POST', `/api/v1/projects/${key}/members`, 'ada', {
      userIds: members,
      roleId: null,
    });
    expect(added.statusCode).toBe(204);
  }
  return () => app.close();
});

describe('following an issue', () => {
  it('is implicit for its reporter, chosen by others', async () => {
    const key = await report('WEB');
    expect(await followingOf(key, 'ada')).toStrictEqual(true);
    expect(await followingOf(key, 'grace')).toStrictEqual(false);

    expect((await follow(key, true, 'grace')).statusCode).toBe(204);
    expect(await followingOf(key, 'grace')).toStrictEqual(true);

    expect((await follow(key, false)).statusCode).toBe(204);
    expect((await follow(key, false)).statusCode).toBe(204);
    expect(await followingOf(key, 'ada')).toStrictEqual(false);
  });

  it('lasts once stopped, even for someone who takes part again', async () => {
    const key = await report('WEB');
    expect((await follow(key, false)).statusCode).toBe(204);
    const said = await call('POST', `/api/v1/issues/${key}/comments`, 'ada', { body: 'Seen it.' });
    expect(said.statusCode).toBe(201);
    expect(await followingOf(key, 'ada')).toStrictEqual(false);

    expect((await follow(key, true)).statusCode).toBe(204);
    expect(await followingOf(key, 'ada')).toStrictEqual(true);
  });

  it('is not a change to the issue: nothing is recorded', async () => {
    const key = await report('WEB');
    expect((await follow(key, true, 'grace')).statusCode).toBe(204);

    const history = await call('GET', `/api/v1/issues/${key}/activities`, 'ada');
    expect(
      issueActivitiesResponseSchema.parse(history.json()).rows.map(({ type }) => type),
    ).toStrictEqual(['issue.created']);
  });

  it('is open to whoever sees the issue, and only to them', async () => {
    const own = await report('WEB', 'rita');
    expect((await follow(own, false, 'rita')).statusCode).toBe(204);

    // A requester sees only the issues she reported: another answers as if it did not exist.
    const other = await follow(await report('WEB'), true, 'rita');
    expect(other.statusCode).toBe(404);
    expect((await follow('WEB-999', true)).statusCode).toBe(404);
    const signedOut = await call('PUT', `/api/v1/issues/${own}/following`, null, {
      following: true,
    });
    expect(signedOut.statusCode).toBe(401);
  });

  it('refuses a malformed choice, and an archived project', async () => {
    const key = await report('WEB');
    expect(
      (await call('PUT', `/api/v1/issues/${key}/following`, 'ada', { following: 'yes' }))
        .statusCode,
    ).toBe(400);

    const old = await report('OLD');
    expect((await call('POST', '/api/v1/projects/OLD/archive', 'ada')).statusCode).toBe(204);
    const archived = await follow(old, false);
    expect(archived.statusCode).toBe(409);
    expect(errorCode(archived)).toBe('PROJECT_ARCHIVED');
  });
});
