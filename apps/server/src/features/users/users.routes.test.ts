import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  assignableRolesResponseSchema,
  membersResponseSchema,
  meResponseSchema,
  userProjectsResponseSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
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
let teamCookie: string;
let teamUserId: string;
let requesterId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const ADMIN = { name: 'Ada Lovelace', email: 'ada@example.com' };
const TEAM_MEMBER = { name: 'Grace Hopper', email: 'grace@example.com' };
/** Lower case on purpose: names sort regardless of case. */
const REQUESTER = { name: 'alan Turing', email: 'alan@example.com' };
const UNKNOWN_USER_ID = '01a1569b-9900-7000-8000-00000000dead';

/** Sign-in is rate limited to 5 per minute: this file signs in 4 times in all. */
function signIn(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
}

function call(
  method: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  body?: object,
) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: { json: () => unknown }) =>
  apiErrorSchema.parse(response.json()).error.code;

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: { setupCode: TEST_SETUP_CODE, admin: { ...ADMIN, password: PASSWORD } },
  });
  expect(setup.statusCode).toBe(201);
  teamUserId = await createTestUser(context.database, {
    ...TEAM_MEMBER,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  requesterId = await createTestUser(context.database, {
    ...REQUESTER,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.requester,
  });
  adminCookie = cookieHeader(await signIn(ADMIN.email));
  teamCookie = cookieHeader(await signIn(TEAM_MEMBER.email));
  return () => app.close();
});

describe('GET /api/v1/members', () => {
  it('pages members by role, then by name, with their role and status only', async () => {
    const response = await call('GET', '/api/v1/members', adminCookie);

    expect(response.statusCode).toBe(200);
    const { rows, matching, totals } = membersResponseSchema.parse(response.json());
    expect(rows.map((row) => (row.type === 'member' ? row.name : row.email))).toStrictEqual([
      'Ada Lovelace',
      'Grace Hopper',
      'alan Turing',
    ]);
    expect(rows.find((row) => row.id === teamUserId)).toStrictEqual({
      type: 'member',
      id: teamUserId,
      ...TEAM_MEMBER,
      role: { id: DEFAULT_ROLE_IDS.team, name: 'Team', color: 'green' },
      deactivatedAt: null,
    });
    expect(Object.keys(response.json().rows[0]).sort()).toStrictEqual([
      'deactivatedAt',
      'email',
      'id',
      'name',
      'role',
      'type',
    ]);
    expect({ matching, totals }).toStrictEqual({
      matching: 3,
      totals: { members: 3, invitations: 0 },
    });
  });

  it('filters by role and searches on the server', async () => {
    const response = await call(
      'GET',
      `/api/v1/members?role=${DEFAULT_ROLE_IDS.team}&search=GRACE`,
      adminCookie,
    );

    const { rows, byRole } = membersResponseSchema.parse(response.json());
    expect(rows.map((row) => row.id)).toStrictEqual([teamUserId]);
    expect(byRole).toStrictEqual({ [DEFAULT_ROLE_IDS.team]: 1 });
  });

  it('rejects malformed filters', async () => {
    for (const query of ['role=team', 'page=0', `search=${'x'.repeat(101)}`]) {
      const response = await call('GET', `/api/v1/members?${query}`, adminCookie);
      expect(response.statusCode, query).toBe(400);
    }
  });

  it('is refused without a session, and to users who cannot manage members', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/members' })).statusCode).toBe(401);
    const forbidden = await call('GET', '/api/v1/members', teamCookie);

    expect(forbidden.statusCode).toBe(403);
    expect(errorCode(forbidden)).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/users/roles', () => {
  it('offers every role with its badge color, in creation order', async () => {
    const response = await call('GET', '/api/v1/users/roles', adminCookie);

    expect(response.statusCode).toBe(200);
    expect(assignableRolesResponseSchema.parse(response.json()).roles).toStrictEqual([
      { id: DEFAULT_ROLE_IDS.administrator, name: 'Administrator', color: 'blue' },
      { id: DEFAULT_ROLE_IDS.team, name: 'Team', color: 'green' },
      { id: DEFAULT_ROLE_IDS.requester, name: 'Requester', color: 'gray' },
    ]);
  });
});

describe('PATCH /api/v1/users/:userId', () => {
  const changeRole = (userId: string, roleId: string) =>
    call('PATCH', `/api/v1/users/${userId}`, adminCookie, { roleId });

  it('gives another role, which applies on the user’s next request', async () => {
    const response = await changeRole(teamUserId, DEFAULT_ROLE_IDS.requester);

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    const me = meResponseSchema.parse((await call('GET', '/api/v1/me', teamCookie)).json());
    expect(me.user?.permissions).toStrictEqual([]);

    expect((await changeRole(teamUserId, DEFAULT_ROLE_IDS.team)).statusCode).toBe(204);
  });

  it('refuses a role that does not exist', async () => {
    const response = await changeRole(teamUserId, UNKNOWN_USER_ID);

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe('INVALID_ROLE');
  });

  it('answers 404 for an unknown user and 400 for a malformed id', async () => {
    const unknown = await changeRole(UNKNOWN_USER_ID, DEFAULT_ROLE_IDS.team);
    const malformed = await changeRole('not-a-uuid', DEFAULT_ROLE_IDS.team);

    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('USER_NOT_FOUND');
    expect(malformed.statusCode).toBe(400);
  });

  it('never lets administrators change their own role', async () => {
    const [admin] = await context.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ADMIN.email));
    const response = await changeRole(admin?.id ?? '', DEFAULT_ROLE_IDS.team);

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('CANNOT_CHANGE_OWN_ROLE');
  });
});

describe('deactivating and reactivating a user', () => {
  const action = (verb: 'deactivate' | 'reactivate', userId = teamUserId) =>
    call('POST', `/api/v1/users/${userId}/${verb}`, adminCookie);

  it('is refused to users who cannot manage users', async () => {
    const response = await call('POST', `/api/v1/users/${teamUserId}/deactivate`, teamCookie);

    expect(response.statusCode).toBe(403);
  });

  it('signs the user out everywhere and keeps them out until reactivated', async () => {
    expect((await action('deactivate')).statusCode).toBe(204);

    const me = await call('GET', '/api/v1/me', teamCookie);
    expect(me.json()).toStrictEqual({ user: null });
    expect((await call('GET', '/api/v1/members', teamCookie)).statusCode).toBe(401);
    const { rows } = membersResponseSchema.parse(
      (await call('GET', '/api/v1/members?search=grace', adminCookie)).json(),
    );
    const [grace] = rows;
    expect(grace?.type === 'member' ? grace.deactivatedAt : undefined).toMatch(
      /^\d{4}-\d{2}-\d{2}T.+Z$/,
    );

    const refused = await signIn(TEAM_MEMBER.email);
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'ACCOUNT_DEACTIVATED' });
    expect(refused.cookies).toHaveLength(0);

    expect((await action('reactivate')).statusCode).toBe(204);
    expect((await signIn(TEAM_MEMBER.email)).statusCode).toBe(200);
  });

  it('answers 404 for an unknown user', async () => {
    expect((await action('deactivate', UNKNOWN_USER_ID)).statusCode).toBe(404);
    expect((await action('reactivate', UNKNOWN_USER_ID)).statusCode).toBe(404);
  });
});

describe('DELETE /api/v1/users/:userId', () => {
  it('erases a member, who leaves the list for good', async () => {
    const deleted = await call('DELETE', `/api/v1/users/${requesterId}`, adminCookie);
    expect(deleted.statusCode).toBe(204);

    const { rows, totals } = membersResponseSchema.parse(
      (await call('GET', '/api/v1/members?search=alan', adminCookie)).json(),
    );
    expect(rows).toStrictEqual([]);
    expect(totals.members).toBe(2);
    const again = await call('DELETE', `/api/v1/users/${requesterId}`, adminCookie);
    expect(again.statusCode).toBe(404);
  });

  it('never deletes the caller', async () => {
    const [admin] = await context.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, ADMIN.email));
    const response = await call('DELETE', `/api/v1/users/${admin?.id}`, adminCookie);

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('CANNOT_DELETE_SELF');
  });
});

describe('a member’s access to projects', () => {
  let webId: string;
  /** Someone of their own: other tests change or delete the members above. */
  let memberId: string;

  async function projectsOf(userId: string, search = '') {
    const response = await call('GET', `/api/v1/users/${userId}/projects${search}`, adminCookie);
    expect(response.statusCode).toBe(200);
    return userProjectsResponseSchema.parse(response.json());
  }

  beforeAll(async () => {
    webId = uuidv7();
    await context.database.db.insert(schema.projects).values([
      { id: webId, key: 'WEB', name: 'Website' },
      { key: 'API', name: 'API' },
      { key: 'OLD', name: 'Archived', archivedAt: new Date() },
    ]);
    memberId = await createTestUser(context.database, {
      name: 'Katherine Johnson',
      email: 'katherine@example.com',
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.requester,
    });
  });

  it('lists the active projects, the member’s first', async () => {
    expect(await call('PUT', `/api/v1/users/${memberId}/projects/WEB`, adminCookie)).toMatchObject({
      statusCode: 204,
    });

    expect(await projectsOf(memberId)).toStrictEqual({
      allProjects: false,
      rows: [
        { key: 'WEB', name: 'Website', member: true },
        { key: 'API', name: 'API', member: false },
      ],
    });
    expect((await projectsOf(memberId, '?search=ap')).rows.map(({ key }) => key)).toStrictEqual([
      'API',
    ]);
  });

  it('takes a member out of a project, and gives them every project', async () => {
    const left = await call('DELETE', `/api/v1/users/${memberId}/projects/WEB`, adminCookie);
    const everything = await call('PUT', `/api/v1/users/${memberId}/projects`, adminCookie, {
      allProjects: true,
    });

    expect(left.statusCode).toBe(204);
    expect(everything.statusCode).toBe(204);
    expect(await projectsOf(memberId)).toMatchObject({
      allProjects: true,
      rows: [
        { key: 'API', member: false },
        { key: 'WEB', member: false },
      ],
    });
  });

  it('refuses a project that does not exist or is archived', async () => {
    const unknown = await call('PUT', `/api/v1/users/${memberId}/projects/NOWHERE`, adminCookie);
    const archived = await call('PUT', `/api/v1/users/${memberId}/projects/OLD`, adminCookie);

    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('PROJECT_NOT_FOUND');
    expect(archived.statusCode).toBe(409);
    expect(errorCode(archived)).toBe('PROJECT_ARCHIVED');
  });

  it('forgets the project access of a deleted member', async () => {
    const formerId = await createTestUser(context.database, {
      name: 'Former',
      email: 'former@example.com',
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    });
    await context.database.db
      .insert(schema.projectMembers)
      .values({ projectId: webId, userId: formerId });

    expect((await call('DELETE', `/api/v1/users/${formerId}`, adminCookie)).statusCode).toBe(204);

    const left = await context.database.db
      .select({ id: schema.projectMembers.id })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.userId, formerId));
    expect(left).toStrictEqual([]);
  });
});
