import { randomUUID } from 'node:crypto';
import {
  ALL_PERMISSIONS,
  canBeGranted,
  isInstancePermission,
  isProjectPermission,
  type Permission,
  type ProjectPermission,
} from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import { apiErrorSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, HTTPMethods, LightMyRequestResponse } from 'fastify';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isProjectAccess } from './platform/auth/access-control.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * Generated from the routes the app registers: adding a route adds its tests. A route either
 * requires a permission of the instance, checked here both ways; or is about a project, which
 * stays hidden from those who do not reach it and checks its permission there; or is listed
 * below as open on purpose.
 */

const OPEN_API_ROUTES = [
  'POST /api/auth/change-password',
  'GET /api/auth/get-session',
  'POST /api/auth/sign-in/email',
  'POST /api/auth/sign-out',
  'POST /api/v1/invitations/accept',
  'POST /api/v1/invitations/preview',
  // The size limit forms check before sending a file: the instance's setting, nothing more.
  'GET /api/v1/attachments/limits',
  // List only the issues the caller may read in each project, filtered in the query.
  'GET /api/v1/issues/assigned',
  'GET /api/v1/issues/search',
  'GET /api/v1/me',
  'PATCH /api/v1/me',
  // Each user's own notifications, filtered in the query by who they are and what they see.
  'GET /api/v1/notifications',
  'GET /api/v1/notifications/unread-count',
  'POST /api/v1/notifications/read',
  // Lists only the projects the caller reaches, filtered in the query.
  'GET /api/v1/projects',
  'GET /api/v1/setup',
  'POST /api/v1/setup',
];

/** Better Auth limits these itself (`platform/auth/auth.ts`). */
const DELEGATED_ROUTES = ['POST /api/auth/sign-in/email', 'POST /api/auth/sign-out'];

const ROUTES = await (async () => {
  const app = await buildTestApp();
  const contracts = app.routeContracts.filter(
    (route) => route.method !== 'HEAD' && route.url.startsWith('/api/'),
  );
  await app.close();
  return contracts;
})();

/** Routes behind a permission of the instance. */
const INSTANCE_ROUTES = ROUTES.flatMap(({ method, url, access }) =>
  typeof access === 'object' && !isProjectAccess(access)
    ? [{ method, url, permission: access.permission }]
    : [],
);

/** Routes about one project, named in their path. */
const PROJECT_ROUTES = ROUTES.flatMap(({ method, url, access }) =>
  isProjectAccess(access) ? [{ method, url, permission: access.permission }] : [],
);

const INSTANCE_PERMISSIONS = ALL_PERMISSIONS.filter(isInstancePermission);
const PROJECT_PERMISSIONS = ALL_PERMISSIONS.filter(isProjectPermission);
const GRANTABLE_PERMISSIONS = ALL_PERMISSIONS.filter(canBeGranted);
const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
/** The project project routes are called about. */
const PROJECT_KEY = 'PERM';

const context = setupTestDatabase();
let app: FastifyInstance;
/** A signed-in user whose role's permissions each test sets: one sign-in for the whole file. */
let probeCookie: string;
let probeId: string;
let probeRoleId: string;
/** The role the project gives the probe, when the probe is one of its members. */
let probeProjectRoleId: string;
let projectId: string;
/** The administrator, for the permissions no role but the system one may hold. */
let adminCookie: string;

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
  const { db } = context.database;
  probeRoleId = uuidv7();
  probeProjectRoleId = uuidv7();
  projectId = uuidv7();
  await db.insert(schema.roles).values([
    { id: probeRoleId, name: 'Probe' },
    { id: probeProjectRoleId, name: 'Probe in the project' },
  ]);
  await db.insert(schema.projects).values({ id: projectId, key: PROJECT_KEY, name: 'Permissions' });
  probeId = await createTestUser(context.database, {
    name: 'Probe',
    email: 'probe@example.com',
    password: PASSWORD,
    instanceRoleId: probeRoleId,
  });
  probeCookie = await signIn('probe@example.com');
  adminCookie = await signIn('ada@example.com');
  return () => app.close();
});

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

async function grantProbe(permissions: readonly Permission[]): Promise<void> {
  await context.database.db
    .update(schema.roles)
    .set({ permissions: [...permissions] })
    .where(eq(schema.roles.id, probeRoleId));
}

/** Makes the probe a member of the project with a role granting `permissions`, or no member. */
async function setProbeMembership(permissions: readonly ProjectPermission[] | null) {
  const { db } = context.database;
  await db.delete(schema.projectMembers).where(eq(schema.projectMembers.userId, probeId));
  if (permissions) {
    await db
      .update(schema.roles)
      .set({ permissions: [...permissions] })
      .where(eq(schema.roles.id, probeProjectRoleId));
    await db
      .insert(schema.projectMembers)
      .values({ projectId, userId: probeId, roleId: probeProjectRoleId });
  }
}

/** Calls a route with made-up parameters and an empty body: enough to get past or be stopped. */
function call(method: HTTPMethods, url: string, cookie = probeCookie) {
  const path = url
    .replaceAll(':projectKey', PROJECT_KEY)
    .replaceAll(':issueKey', `${PROJECT_KEY}-1`)
    .replaceAll(/:\w+/g, () => randomUUID());
  return app.inject({
    method,
    url: path,
    headers: { origin: ORIGIN, cookie },
    ...(method === 'GET' ? {} : { body: {} }),
  });
}

/** The code of the refusal, if the request was refused at all. */
function refusal(response: LightMyRequestResponse): string | null {
  return response.statusCode < 400 ? null : apiErrorSchema.parse(response.json()).error.code;
}

it('opens only the expected API routes without a permission', () => {
  const open = ROUTES.filter(({ access }) => typeof access === 'string').map(
    ({ method, url }) => `${method} ${url}`,
  );

  expect(open.sort()).toStrictEqual([...OPEN_API_ROUTES].sort());
  expect(INSTANCE_ROUTES.length).toBeGreaterThan(0);
  expect(PROJECT_ROUTES.length).toBeGreaterThan(0);
});

it('rate limits every public route that writes', () => {
  const unlimited = ROUTES.filter(
    ({ method, access, rateLimited }) => access === 'public' && method !== 'GET' && !rateLimited,
  ).map(({ method, url }) => `${method} ${url}`);

  expect(unlimited).toStrictEqual(DELEGATED_ROUTES);
});

describe.each(INSTANCE_ROUTES)('$method $url', ({ method, url, permission }) => {
  it(`refuses a user who has every permission but ${permission}`, async () => {
    await grantProbe(INSTANCE_PERMISSIONS.filter((granted) => granted !== permission));
    const response = await call(method, url);

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('FORBIDDEN');
  });

  // No role but the system one may hold some permissions: an administrator must get through.
  const systemOnly = !canBeGranted(permission);
  it(
    systemOnly ? 'lets the system role through' : `lets a user with only ${permission} through`,
    async () => {
      if (!systemOnly) {
        await grantProbe([permission]);
      }
      const response = await call(method, url, systemOnly ? adminCookie : probeCookie);

      expect([401, 403]).not.toContain(response.statusCode);
    },
  );
});

/** What to grant for `permission`: in the member's own role, or in the role the project gives. */
function grantsFor(permission: Permission | undefined) {
  return {
    own: permission && isInstancePermission(permission) ? [permission] : [],
    inProject: permission && isProjectPermission(permission) ? [permission] : [],
  };
}

describe.each(PROJECT_ROUTES)('$method $url', ({ method, url, permission }) => {
  // One of these routes deletes the project: each test starts with it in place.
  beforeEach(async () => {
    await context.database.db
      .insert(schema.projects)
      .values({ id: projectId, key: PROJECT_KEY, name: 'Permissions' })
      .onConflictDoNothing();
  });

  it('answers as if the project did not exist to a user who cannot reach it', async () => {
    await grantProbe(GRANTABLE_PERMISSIONS);
    await setProbeMembership(null);
    const response = await call(method, url);

    expect(response.statusCode).toBe(404);
    expect(refusal(response)).toBe('PROJECT_NOT_FOUND');
  });

  if (permission) {
    it(`refuses a member who has every permission but ${permission}`, async () => {
      await grantProbe(GRANTABLE_PERMISSIONS.filter((granted) => granted !== permission));
      await setProbeMembership(PROJECT_PERMISSIONS.filter((granted) => granted !== permission));
      const response = await call(method, url);

      expect(response.statusCode).toBe(403);
      expect(refusal(response)).toBe('FORBIDDEN');
    });
  }

  it(`lets in a member who holds ${permission ?? 'nothing'} but that`, async () => {
    const { own, inProject } = grantsFor(permission);
    await grantProbe(own);
    await setProbeMembership(inProject);
    const response = await call(method, url);

    expect(['UNAUTHENTICATED', 'FORBIDDEN', 'PROJECT_NOT_FOUND']).not.toContain(refusal(response));
  });
});
