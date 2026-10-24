import { ALL_PERMISSIONS, DEFAULT_ROLE_IDS } from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import {
  apiErrorSchema,
  createRoleResponseSchema,
  meResponseSchema,
  ROLES_MAX,
  rolesResponseSchema,
} from '@toppo/shared';
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
let adminId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const ADMIN = { name: 'Ada Lovelace', email: 'ada@example.com' };
const TEAM_MEMBER = { name: 'Grace Hopper', email: 'grace@example.com' };
const UNKNOWN_ROLE_ID = '01a1569b-9900-7000-8000-00000000dead';
const TEAM_PERMISSIONS = [
  'issue.read',
  'issue.read.own',
  'issue.create',
  'issue.update',
  'issue.assign',
  'comment.create',
];

function signIn(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
}

function call(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

async function listRoles() {
  const response = await call('GET', '/api/v1/roles', adminCookie);
  expect(response.statusCode).toBe(200);
  return rolesResponseSchema.parse(response.json()).roles;
}

async function createRole(name: string, color = 'violet'): Promise<string> {
  const response = await call('POST', '/api/v1/roles', adminCookie, { name, color });
  expect(response.statusCode).toBe(201);
  return createRoleResponseSchema.parse(response.json()).id;
}

async function invite(roleId: string, acceptedAt: Date | null = null): Promise<void> {
  await context.database.db.insert(schema.invitations).values({
    email: `invited-${uuidv7()}@example.com`,
    roleId,
    tokenHash: uuidv7(),
    invitedById: adminId,
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt,
  });
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: { setupCode: TEST_SETUP_CODE, admin: { ...ADMIN, password: PASSWORD } },
  });
  expect(setup.statusCode).toBe(201);
  adminId = String(setup.json().userId);
  await createTestUser(context.database, {
    ...TEAM_MEMBER,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  adminCookie = cookieHeader(await signIn(ADMIN.email));
  teamCookie = cookieHeader(await signIn(TEAM_MEMBER.email));
  return () => app.close();
});

describe('roles routes', () => {
  it.each([
    ['GET', '/api/v1/roles'],
    ['POST', '/api/v1/roles'],
    ['PUT', '/api/v1/roles/permissions'],
    ['PATCH', `/api/v1/roles/${UNKNOWN_ROLE_ID}`],
    ['DELETE', `/api/v1/roles/${UNKNOWN_ROLE_ID}`],
  ] as const)('%s %s needs a session, then the system role', async (method, url) => {
    const anonymous = await call(method, url, '', {});
    const member = await call(method, url, teamCookie, {});

    expect(anonymous.statusCode).toBe(401);
    expect(member.statusCode).toBe(403);
    expect(errorCode(member)).toBe('FORBIDDEN');
  });
});

describe('GET /api/v1/roles', () => {
  it('lists the roles in creation order, with what they grant and who holds them', async () => {
    const roles = await listRoles();

    expect(
      roles.map(({ id, name, color, grantsAll }) => ({ id, name, color, grantsAll })),
    ).toStrictEqual([
      { id: DEFAULT_ROLE_IDS.administrator, name: 'Administrator', color: 'blue', grantsAll: true },
      { id: DEFAULT_ROLE_IDS.team, name: 'Team', color: 'green', grantsAll: false },
      { id: DEFAULT_ROLE_IDS.requester, name: 'Requester', color: 'gray', grantsAll: false },
    ]);
    expect(roles[0]?.permissions).toStrictEqual(ALL_PERMISSIONS);
    expect(roles[1]?.permissions).toStrictEqual(TEAM_PERMISSIONS);
    expect(roles.map(({ memberCount }) => memberCount)).toStrictEqual([1, 1, 0]);
  });

  it('counts deactivated members and pending invitations, not deleted or accepted ones', async () => {
    const roleId = await createRole('Counted');
    await createTestUser(context.database, {
      name: 'Former',
      email: 'former@example.com',
      password: PASSWORD,
      instanceRoleId: roleId,
    });
    await context.database.db
      .update(schema.users)
      .set({ deactivatedAt: new Date() })
      .where(eq(schema.users.email, 'former@example.com'));
    await context.database.db.insert(schema.users).values({
      name: '',
      email: `deleted-${uuidv7()}@deleted.invalid`,
      instanceRoleId: roleId,
      deactivatedAt: new Date(),
      deletedAt: new Date(),
    });
    await invite(roleId);
    await invite(roleId, new Date());

    const role = (await listRoles()).find(({ id }) => id === roleId);

    expect(role).toMatchObject({ memberCount: 1, invitationCount: 1, permissions: [] });
  });
});

describe('POST /api/v1/roles', () => {
  it('creates a role without permissions', async () => {
    const roleId = await createRole('  Supervisor ', 'amber');

    expect((await listRoles()).at(-1)).toStrictEqual({
      id: roleId,
      name: 'Supervisor',
      color: 'amber',
      grantsAll: false,
      permissions: [],
      notifyNewIssues: false,
      memberCount: 0,
      invitationCount: 0,
      projectCount: 0,
    });
  });

  it('refuses a name another role has, whatever its case', async () => {
    const response = await call('POST', '/api/v1/roles', adminCookie, {
      name: 'TEAM',
      color: 'gray',
    });

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('ROLE_NAME_TAKEN');
  });

  it.each([
    { name: ' ', color: 'gray' },
    { name: 'x'.repeat(41), color: 'gray' },
    { name: 'Auditor', color: '#ff0000' },
    { name: 'Auditor' },
  ])('refuses an invalid role: %j', async (body) => {
    const response = await call('POST', '/api/v1/roles', adminCookie, body);

    expect(response.statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/roles/:roleId', () => {
  it('renames a role and changes its color', async () => {
    const roleId = await createRole('Contractor');

    const response = await call('PATCH', `/api/v1/roles/${roleId}`, adminCookie, {
      name: 'Contractors',
      color: 'cyan',
    });

    expect(response.statusCode).toBe(204);
    expect((await listRoles()).find(({ id }) => id === roleId)).toMatchObject({
      name: 'Contractors',
      color: 'cyan',
    });
  });

  it('lets a role change the case of its own name, not take another one', async () => {
    const roleId = await createRole('Auditor');

    const ownName = await call('PATCH', `/api/v1/roles/${roleId}`, adminCookie, {
      name: 'AUDITOR',
      color: 'violet',
    });
    const otherName = await call('PATCH', `/api/v1/roles/${roleId}`, adminCookie, {
      name: 'requester',
      color: 'violet',
    });

    expect(ownName.statusCode).toBe(204);
    expect(otherName.statusCode).toBe(409);
    expect(errorCode(otherName)).toBe('ROLE_NAME_TAKEN');
  });

  it('leaves the system role as it is', async () => {
    const response = await call(
      'PATCH',
      `/api/v1/roles/${DEFAULT_ROLE_IDS.administrator}`,
      adminCookie,
      {
        name: 'Boss',
        color: 'gray',
      },
    );

    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe('SYSTEM_ROLE_LOCKED');
  });

  it('answers 404 for an unknown role and 400 for a bad id', async () => {
    const body = { name: 'Ghost', color: 'gray' };
    const unknown = await call('PATCH', `/api/v1/roles/${UNKNOWN_ROLE_ID}`, adminCookie, body);
    const malformed = await call('PATCH', '/api/v1/roles/not-an-id', adminCookie, body);

    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('ROLE_NOT_FOUND');
    expect(malformed.statusCode).toBe(400);
  });
});

describe('DELETE /api/v1/roles/:roleId', () => {
  it('deletes a role left only in history', async () => {
    const roleId = await createRole('Temporary');
    await invite(roleId, new Date());

    const response = await call('DELETE', `/api/v1/roles/${roleId}`, adminCookie);

    expect(response.statusCode).toBe(204);
    expect((await listRoles()).some(({ id }) => id === roleId)).toBe(false);
  });

  it('refuses while a member or a pending invitation has it', async () => {
    const invited = await createRole('Invited');
    await invite(invited);

    const held = await call('DELETE', `/api/v1/roles/${DEFAULT_ROLE_IDS.team}`, adminCookie);
    const pending = await call('DELETE', `/api/v1/roles/${invited}`, adminCookie);

    expect(held.statusCode).toBe(409);
    expect(errorCode(held)).toBe('ROLE_IN_USE');
    expect(pending.statusCode).toBe(409);
    expect(errorCode(pending)).toBe('ROLE_IN_USE');
  });

  it('never deletes the system role, and answers 404 for an unknown one', async () => {
    const system = await call(
      'DELETE',
      `/api/v1/roles/${DEFAULT_ROLE_IDS.administrator}`,
      adminCookie,
    );
    const unknown = await call('DELETE', `/api/v1/roles/${UNKNOWN_ROLE_ID}`, adminCookie);

    expect(system.statusCode).toBe(403);
    expect(errorCode(system)).toBe('SYSTEM_ROLE_LOCKED');
    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('ROLE_NOT_FOUND');
  });
});

describe('PUT /api/v1/roles/permissions', () => {
  it('saves several roles at once, applied on the members’ next request', async () => {
    const reviewer = await createRole('Reviewer');

    const response = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [
        {
          roleId: DEFAULT_ROLE_IDS.team,
          from: TEAM_PERMISSIONS,
          to: [...TEAM_PERMISSIONS.filter((p) => p !== 'issue.assign'), 'instance.users.manage'],
        },
        { roleId: reviewer, from: [], to: ['comment.create', 'issue.read', 'issue.read'] },
      ],
    });

    expect(response.statusCode).toBe(204);
    const roles = await listRoles();
    expect(roles.find(({ id }) => id === reviewer)?.permissions).toStrictEqual([
      'issue.read',
      'comment.create',
    ]);
    const me = meResponseSchema.parse((await call('GET', '/api/v1/me', teamCookie)).json());
    expect(me.user?.permissions).toStrictEqual(['instance.users.manage']);
  });

  it('saves nothing when one of the roles changed since the matrix was loaded', async () => {
    const first = await createRole('First');
    const second = await createRole('Second');

    const response = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [
        { roleId: first, from: [], to: ['issue.read'] },
        { roleId: second, from: ['issue.create'], to: ['issue.read'] },
      ],
    });

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('ROLES_CHANGED');
    expect((await listRoles()).find(({ id }) => id === first)?.permissions).toStrictEqual([]);
  });

  it.each([['instance.roles.manage'], ['issue.fly']])(
    'refuses to give a role %s',
    async (permission) => {
      const response = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
        changes: [{ roleId: DEFAULT_ROLE_IDS.requester, from: [], to: [permission] }],
      });

      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('INVALID_PERMISSIONS');
    },
  );

  it('leaves the system role alone and reports unknown roles', async () => {
    const system = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [{ roleId: DEFAULT_ROLE_IDS.administrator, from: ALL_PERMISSIONS, to: [] }],
    });
    const unknown = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [{ roleId: UNKNOWN_ROLE_ID, from: [], to: [] }],
    });

    expect(system.statusCode).toBe(403);
    expect(errorCode(system)).toBe('SYSTEM_ROLE_LOCKED');
    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('ROLE_NOT_FOUND');
  });

  it('tells the team of new issues by default, and lets every role change it', async () => {
    const notified = async () =>
      Object.fromEntries(
        (await listRoles()).map(({ id, notifyNewIssues }) => [id, notifyNewIssues]),
      );
    expect(await notified()).toMatchObject({
      [DEFAULT_ROLE_IDS.administrator]: true,
      [DEFAULT_ROLE_IDS.team]: true,
      [DEFAULT_ROLE_IDS.requester]: false,
    });
    const turnOff = {
      roleId: DEFAULT_ROLE_IDS.administrator,
      from: ALL_PERMISSIONS,
      to: ALL_PERMISSIONS,
      notifyNewIssues: { from: true, to: false },
    };

    const saved = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [turnOff],
    });
    const stale = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [turnOff],
    });

    expect(saved.statusCode).toBe(204);
    expect((await notified())[DEFAULT_ROLE_IDS.administrator]).toBe(false);
    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('ROLES_CHANGED');
    const back = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [{ ...turnOff, notifyNewIssues: { from: false, to: true } }],
    });
    expect(back.statusCode).toBe(204);
  });

  it('refuses the same role twice in one save', async () => {
    const change = { roleId: DEFAULT_ROLE_IDS.requester, from: [], to: [] };
    const response = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [change, change],
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('the limit on roles', () => {
  it(`refuses a role beyond ${ROLES_MAX}`, async () => {
    const existing = (await listRoles()).length;
    for (let index = existing; index < ROLES_MAX; index += 1) {
      await createRole(`Filler ${index}`);
    }

    const response = await call('POST', '/api/v1/roles', adminCookie, {
      name: 'One too many',
      color: 'gray',
    });

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('ROLE_LIMIT_REACHED');
  });
});
