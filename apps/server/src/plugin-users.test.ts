import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { apiErrorSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from './platform/auth/auth.ts';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  packageSha256Of,
  setupTestDatabase,
  TEST_SECRET,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * A plugin's own user is no person: it writes for its plugin, under the plugin's approval. Every
 * list of people leaves it out, every operation on a person refuses it, and it never signs in.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let pluginUserId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const PLUGIN_ADDRESS = 'time-tracking@plugins.invalid';

function call(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: LightMyRequestResponse) =>
  apiErrorSchema.parse(response.json()).error.code;

async function install(manifest = testManifest()): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip' },
    payload: testPackage({ manifest }),
  });
  expect(response.statusCode, response.body).toBe(201);
}

async function approve(slug: string) {
  return await call('POST', `/api/v1/plugins/${slug}/approve`, {
    packageSha256: await packageSha256Of(context.database, slug),
    projects: ['WEB'],
  });
}

async function pluginUsers(slug = 'time-tracking') {
  return await context.database.db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      instanceRoleId: schema.users.instanceRoleId,
      allProjects: schema.users.allProjects,
    })
    .from(schema.users)
    .where(eq(schema.users.pluginSlug, slug));
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
  adminCookie = cookieHeader(
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      body: { email: 'ada@example.com', password: PASSWORD },
    }),
  );
  expect((await call('POST', '/api/v1/projects', { key: 'WEB', name: 'Website' })).statusCode).toBe(
    201,
  );
  const issue = await call('POST', '/api/v1/projects/WEB/issues', { title: 'Invoices fail' });
  expect(issue.statusCode, issue.body).toBe(201);
  await install();
  expect((await approve('time-tracking')).statusCode).toBe(204);
  const [user] = await pluginUsers();
  pluginUserId = user?.id ?? '';
});

describe("a plugin's own user", () => {
  it('is made at its first approval, holding no role, and found again once it comes back', async () => {
    expect(await pluginUsers()).toStrictEqual([
      {
        id: pluginUserId,
        name: 'Time tracking',
        email: PLUGIN_ADDRESS,
        instanceRoleId: null,
        allProjects: false,
      },
    ]);

    expect((await approve('time-tracking')).statusCode).toBe(204);
    expect((await call('DELETE', '/api/v1/plugins/time-tracking')).statusCode).toBe(204);
    await install();
    expect((await approve('time-tracking')).statusCode).toBe(204);

    expect((await pluginUsers()).map(({ id }) => id)).toStrictEqual([pluginUserId]);
  });

  it('is not made when its address belongs to someone, and the plugin is not approved', async () => {
    await createTestUser(context.database, {
      name: 'Rita Reports',
      email: 'reports@plugins.invalid',
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    });
    await install(testManifest({ id: 'reports' }));

    const refused = await approve('reports');

    expect(refused.statusCode).toBe(409);
    expect(errorCode(refused)).toBe('PLUGIN_USER_EMAIL_TAKEN');
    expect(await pluginUsers('reports')).toStrictEqual([]);
    const plugin = await call('GET', '/api/v1/plugins/reports');
    expect(plugin.json()).toMatchObject({ state: 'pending', approval: null });
  });

  it.each([
    ['the members of the instance', '/api/v1/members'],
    ['who reaches a project', '/api/v1/projects/WEB/access'],
    ['who may join a project', '/api/v1/projects/WEB/candidates'],
    ['who may be given an issue', '/api/v1/projects/WEB/assignees'],
    ['who may be mentioned', '/api/v1/issues/WEB-1/mentionable'],
  ])('is left out of %s', async (_, url) => {
    const listed = await call('GET', url);

    expect(listed.statusCode).toBe(200);
    expect(listed.body).not.toContain(pluginUserId);
    expect(listed.body).not.toContain(PLUGIN_ADDRESS);
  });

  it('is not named to plugins’ screens, which ask for people by id', async () => {
    const named = await call('GET', `/api/v1/people?ids=${pluginUserId}`);

    expect(named.statusCode).toBe(200);
    expect(named.json()).toStrictEqual({ people: [] });
  });

  it.each([
    ['its projects listed', 'GET', '/projects', undefined],
    ['every project opened to it', 'PUT', '/projects', { allProjects: true }],
    ['a project opened to it', 'PUT', '/projects/WEB', undefined],
    ['a project closed to it', 'DELETE', '/projects/WEB', undefined],
    ['a role', 'PATCH', '', { roleId: DEFAULT_ROLE_IDS.team }],
    ['deactivation', 'POST', '/deactivate', undefined],
    ['reactivation', 'POST', '/reactivate', undefined],
    ['deletion', 'DELETE', '', undefined],
  ] as const)('is not a member to manage: refuses %s', async (_, method, path, body) => {
    const refused = await call(method, `/api/v1/users/${pluginUserId}${path}`, body);

    expect(refused.statusCode).toBe(404);
    expect(errorCode(refused)).toBe('USER_NOT_FOUND');
  });

  it('is never added to a project, given an issue or mentioned', async () => {
    const added = await call('POST', '/api/v1/projects/WEB/members', {
      userIds: [pluginUserId],
      roleId: null,
    });
    const assigned = await call('PUT', '/api/v1/issues/WEB-1/assignee', {
      assigneeId: pluginUserId,
    });
    const mentioned = await call('POST', '/api/v1/issues/WEB-1/comments', {
      body: 'Over to you',
      mentions: [pluginUserId],
    });

    expect([added, assigned, mentioned].map((response) => response.statusCode)).toStrictEqual([
      404, 400, 400,
    ]);
    expect(errorCode(mentioned)).toBe('INVALID_MENTION');
  });

  it('holds no role and no access of its own, whatever the code tries', async () => {
    const { db } = context.database;
    const ofThePlugin = eq(schema.users.id, pluginUserId);

    await expect(
      db.update(schema.users).set({ instanceRoleId: DEFAULT_ROLE_IDS.team }).where(ofThePlugin),
    ).rejects.toThrow();
    await expect(
      db.update(schema.users).set({ allProjects: true }).where(ofThePlugin),
    ).rejects.toThrow();
  });

  it('never signs in, even given a password', async () => {
    const auth = createAuth({
      db: context.database.db,
      secret: TEST_SECRET,
      publicUrl: new URL(ORIGIN),
    });
    await context.database.db.insert(schema.accounts).values({
      accountId: pluginUserId,
      providerId: 'credential',
      userId: pluginUserId,
      password: await (await auth.$context).password.hash(PASSWORD),
    });

    const refused = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      body: { email: PLUGIN_ADDRESS, password: PASSWORD },
    });

    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: 'PLUGIN_ACCOUNT' });
    await context.database.db
      .delete(schema.accounts)
      .where(eq(schema.accounts.userId, pluginUserId));
  });
});
