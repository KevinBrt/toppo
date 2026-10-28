import {
  DEFAULT_ROLE_IDS,
  DEFAULT_ROLES,
  instancePermissionsOf,
  type Permission,
} from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { apiErrorSchema, meResponseSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';
import type { ZodTypeProvider } from '../http/zod.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let teamCookie: string;
let teamUserId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const ADMIN_EMAIL = 'ada@example.com';
const TEAM_EMAIL = 'grace@example.com';

const storedPermissionsOf = (roleId: string) =>
  DEFAULT_ROLES.find((role) => role.id === roleId)?.permissions ?? [];
const ALL_INSTANCE_PERMISSIONS = instancePermissionsOf({ grantsAll: true, permissions: [] });

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

function callUsersRoute(method: 'GET' | 'POST', cookie?: string) {
  return app.inject({
    method,
    url: '/api/test/users',
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(method === 'POST' ? { body: { not: 'what the route expects' } } : {}),
  });
}

async function permissionsInMe(cookie: string): Promise<string[] | undefined> {
  const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
  return meResponseSchema.parse(response.json()).user?.permissions;
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const usersRoute = {
    config: { access: { permission: 'instance.users.manage' } },
    schema: { response: { 200: z.object({ email: z.string() }) } },
  } as const;
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.get('/api/test/users', usersRoute, (request) => ({ email: request.actor?.email ?? '' }));
  routes.post(
    '/api/test/users',
    { ...usersRoute, schema: { ...usersRoute.schema, body: z.object({ title: z.string() }) } },
    () => ({ email: 'unreachable' }),
  );

  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: ADMIN_EMAIL, password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  teamUserId = await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: TEAM_EMAIL,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  // Two sign-ins for the whole file: sign-in is rate limited to 5 per minute.
  adminCookie = await signIn(ADMIN_EMAIL);
  teamCookie = await signIn(TEAM_EMAIL);
  return () => app.close();
});

describe('routes behind a permission', () => {
  it('refuse anonymous callers before looking at their request', async () => {
    const response = await callUsersRoute('POST');

    expect(response.statusCode).toBe(401);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuse a user without the permission before looking at their request', async () => {
    const response = await callUsersRoute('POST', teamCookie);

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('FORBIDDEN');
  });

  it('let a user whose role grants the permission through', async () => {
    const response = await callUsersRoute('GET', adminCookie);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ email: ADMIN_EMAIL });
  });

  it('follow a role change on the next request, without signing in again', async () => {
    const setRole = (instanceRoleId: string) =>
      context.database.db
        .update(schema.users)
        .set({ instanceRoleId })
        .where(eq(schema.users.id, teamUserId));

    await setRole(DEFAULT_ROLE_IDS.administrator);
    expect((await callUsersRoute('GET', teamCookie)).statusCode).toBe(200);

    await setRole(DEFAULT_ROLE_IDS.team);
    expect((await callUsersRoute('GET', teamCookie)).statusCode).toBe(403);
  });
});

describe('the permissions of the current user', () => {
  it('are the instance-wide permissions of their role', async () => {
    expect((await permissionsInMe(adminCookie))?.sort()).toStrictEqual(
      ALL_INSTANCE_PERMISSIONS.sort(),
    );
    expect(await permissionsInMe(teamCookie)).toStrictEqual([]);
  });

  it('never include what the role may not be given, nor unknown permissions', async () => {
    const setTeamPermissions = (permissions: string[]) =>
      context.database.db
        .update(schema.roles)
        // On purpose: what a faulty write or a removed plugin could leave in the database.
        .set({ permissions: permissions as Permission[] })
        .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.team));
    const original = [...storedPermissionsOf(DEFAULT_ROLE_IDS.team)];

    await setTeamPermissions([
      ...original,
      'project.create',
      'instance.roles.manage',
      'plugin.removed',
    ]);
    try {
      expect(await permissionsInMe(teamCookie)).toStrictEqual(['project.create']);
    } finally {
      await setTeamPermissions(original);
    }
  });
});
