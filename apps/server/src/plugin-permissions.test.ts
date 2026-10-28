import { DEFAULT_ROLE_IDS, DEFAULT_ROLES } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  meResponseSchema,
  projectResponseSchema,
  rolesResponseSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * The permissions a plugin adds join Toppo's in one catalog while it is installed: the roles and
 * permissions matrix shows them, roles are given them, their members hold them. They leave every
 * role for good when the plugin is removed, or when a new version no longer declares them.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let graceCookie: string;
let graceId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const LOG = 'time-tracking.entries.log';
const REPORTS = 'time-tracking.reports.read';
const TEAM_PERMISSIONS = DEFAULT_ROLES.find(({ id }) => id === DEFAULT_ROLE_IDS.team)?.permissions;

/** Time tracking, with a permission in projects and one in the whole instance, in two languages. */
const manifest = (permissions = ['entries.log', 'reports.read']) =>
  testManifest({
    permissions: Object.fromEntries(
      permissions.map((name) => [
        name,
        name === 'entries.log'
          ? { scope: 'project', label: 'permissions.log' }
          : { scope: 'instance', label: 'permissions.reports' },
      ]),
    ),
    messages: {
      en: { permissions: { log: 'Log time', reports: 'Read the reports' } },
      fr: { permissions: { log: 'Saisir du temps' } },
    },
  });

function call(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: object,
  cookie = adminCookie,
) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie },
    ...(body ? { body } : {}),
  });
}

async function install(permissions?: string[]): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip' },
    payload: testPackage({ manifest: manifest(permissions) }),
  });
  expect(response.statusCode, response.body).toBe(201);
}

async function matrix() {
  const response = await call('GET', '/api/v1/roles');
  expect(response.statusCode).toBe(200);
  return rolesResponseSchema.parse(response.json());
}

async function teamPermissions(): Promise<string[]> {
  return (await matrix()).roles.find(({ id }) => id === DEFAULT_ROLE_IDS.team)?.permissions ?? [];
}

function saveTeam(from: string[], to: string[]) {
  return call('PUT', '/api/v1/roles/permissions', {
    changes: [{ roleId: DEFAULT_ROLE_IDS.team, from, to }],
  });
}

async function storedTeamPermissions(): Promise<string[]> {
  const [team] = await context.database.db
    .select({ permissions: schema.roles.permissions })
    .from(schema.roles)
    .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.team));
  return team?.permissions ?? [];
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
  graceId = await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  adminCookie = await signIn('ada@example.com');
  graceCookie = await signIn('grace@example.com');
  expect((await call('POST', '/api/v1/projects', { key: 'WEB', name: 'Website' })).statusCode).toBe(
    201,
  );
  const joined = await call('POST', '/api/v1/projects/WEB/members', {
    userIds: [graceId],
    roleId: null,
  });
  expect(joined.statusCode).toBe(204);
});

beforeEach(async () => {
  await context.database.db.delete(schema.plugins);
  await context.database.db
    .update(schema.roles)
    .set({ permissions: [...(TEAM_PERMISSIONS ?? [])] })
    .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.team));
});

describe('the permissions of a plugin', () => {
  it('join the matrix once it is installed, in its own words, held by the system role only', async () => {
    await install();

    const { plugins, roles } = await matrix();

    expect(plugins).toStrictEqual([
      {
        slug: 'time-tracking',
        name: 'Time tracking',
        permissions: [
          { name: LOG, scope: 'project', label: { en: 'Log time', fr: 'Saisir du temps' } },
          {
            name: REPORTS,
            scope: 'instance',
            label: { en: 'Read the reports', fr: 'Read the reports' },
          },
        ],
      },
    ]);
    const system = roles.find(({ grantsAll }) => grantsAll);
    expect(system?.permissions.slice(-2)).toStrictEqual([LOG, REPORTS]);
    expect(await teamPermissions()).not.toContain(LOG);
  });

  it('are given to a role, whose members hold them in the whole instance or in their projects', async () => {
    await install();
    const before = await teamPermissions();

    expect((await saveTeam(before, [...before, LOG, REPORTS])).statusCode).toBe(204);

    const me = meResponseSchema.parse(
      (await call('GET', '/api/v1/me', undefined, graceCookie)).json(),
    );
    expect(me.user?.permissions).toContain(REPORTS);
    expect(me.user?.permissions).not.toContain(LOG);
    const project = projectResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB', undefined, graceCookie)).json(),
    );
    expect(project.permissions).toContain(LOG);
    expect(project.permissions).not.toContain(REPORTS);
  });

  it('are none when this Toppo cannot read what a plugin declared, and fail no request', async () => {
    await context.database.db.insert(schema.plugins).values({
      slug: 'unreadable',
      version: '1.0.0',
      manifest: { permissions: 'not a record', messages: [] },
      packageSha256: 'a'.repeat(64),
    });

    expect((await matrix()).plugins).toStrictEqual([
      { slug: 'unreadable', name: 'Unreadable', permissions: [] },
    ]);
    expect((await call('GET', '/api/v1/me', undefined, graceCookie)).statusCode).toBe(200);
  });

  it('are refused to a role when no plugin installed declares them', async () => {
    const before = await teamPermissions();

    const refused = await saveTeam(before, [...before, LOG]);

    expect(refused.statusCode).toBe(400);
    expect(apiErrorSchema.parse(refused.json()).error.code).toBe('INVALID_PERMISSIONS');
  });

  it('leave every role when a new version no longer declares them, the others staying', async () => {
    await install();
    const before = await teamPermissions();
    expect((await saveTeam(before, [...before, LOG, REPORTS])).statusCode).toBe(204);

    await install(['entries.log']);

    const stored = await storedTeamPermissions();
    expect(stored).toContain(LOG);
    expect(stored).not.toContain(REPORTS);
  });

  it('leave every role for good when the plugin is removed: installing it again gives none back', async () => {
    await install();
    const before = await teamPermissions();
    expect((await saveTeam(before, [...before, LOG, REPORTS])).statusCode).toBe(204);

    expect((await call('DELETE', '/api/v1/plugins/time-tracking')).statusCode).toBe(204);

    expect(await storedTeamPermissions()).toStrictEqual(TEAM_PERMISSIONS);
    await install();
    expect(await teamPermissions()).not.toContain(LOG);
  });
});
