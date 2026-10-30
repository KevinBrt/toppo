import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPersonPermission } from './features/plugins/queries/check-person-permission.query.ts';
import { actingPlugin } from './features/plugins/utils/plugin-actor.util.ts';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  packageSha256Of,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from './test-helpers.ts';

/*
 * A plugin asks whether someone holds one of its own permissions (`ctx.people.can`): acting for
 * someone, about them only; as itself, about the people of its projects. Toppo's own permissions
 * are no plugin's to read.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const LOG = 'time-tracking.entries.log';
const READ = 'time-tracking.reports.read';

const MANIFEST = testManifest({
  permissions: {
    'entries.log': { scope: 'project', label: 'permissions.log' },
    'reports.read': { scope: 'instance', label: 'permissions.log' },
  },
  actions: [{ name: 'people.ask', access: 'authenticated', input: {} }],
  events: [],
});

/** Asks Toppo whether someone can, as the input says: Toppo checks it all itself. */
const RUN = `
  const answer = await __host
    .call('people.can', payload)
    .then((answered) => ({ answer: JSON.parse(answered) }), (error) => ({ refused: error.message }));
  return JSON.stringify({ ok: true, result: answer });
`;

function call(who: string, method: 'GET' | 'POST' | 'PUT', url: string, body?: object) {
  const headers = { origin: ORIGIN, cookie: cookies[who] ?? '' };
  return app.inject(body === undefined ? { method, url, headers } : { method, url, headers, body });
}

/** What Toppo answers the plugin acting for `who`. */
async function asks(
  who: string,
  args: { personId: string | undefined; permission: string; projectId?: string | undefined },
): Promise<{ answer?: boolean; refused?: string }> {
  const response = await call(
    who,
    'POST',
    '/api/v1/plugins/time-tracking/actions/people.ask',
    args,
  );
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ result: { answer?: boolean; refused?: string } }>().result;
}

/** What Toppo answers the plugin as itself, as on an event or a job. */
async function asksAsItself(args: { personId: string; permission: string; projectId?: string }) {
  const { db } = context.database;
  const services = testServices();
  const plugin = await actingPlugin(db, { slug: 'time-tracking' }, services.secrets);
  return await checkPersonPermission.execute(
    { db, actor: plugin?.actor ?? null, log: Fastify({ logger: false }).log, services },
    args,
  );
}

/** Gives the team role `permissions` besides those it has. */
async function grantTeam(...permissions: string[]): Promise<void> {
  const listed = await call('ada', 'GET', '/api/v1/roles');
  const held =
    listed
      .json<{ roles: { id: string; permissions: string[] }[] }>()
      .roles.find(({ id }) => id === DEFAULT_ROLE_IDS.team)?.permissions ?? [];
  const changed = await call('ada', 'PUT', '/api/v1/roles/permissions', {
    changes: [
      { roleId: DEFAULT_ROLE_IDS.team, from: held, to: [...new Set([...held, ...permissions])] },
    ],
  });
  expect(changed.statusCode, changed.body).toBe(204);
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

/** Someone with the team role, working in `projectKey`, signed in as `who`. */
async function memberOf(projectKey: string, who: string): Promise<void> {
  ids[who] = await createTestUser(context.database, {
    name: who,
    email: `${who}@example.com`,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  await signIn(who, `${who}@example.com`);
  const joined = await call('ada', 'POST', `/api/v1/projects/${projectKey}/members`, {
    userIds: [ids[who]],
    roleId: null,
  });
  expect(joined.statusCode, joined.body).toBe(204);
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
  ids['ada'] = (await call('ada', 'GET', '/api/v1/me')).json<{ user: { id: string } }>().user.id;
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['OPS', 'Operations'],
  ] as const) {
    const created = await call('ada', 'POST', '/api/v1/projects', { key, name });
    expect(created.statusCode).toBe(201);
    ids[key] = created.json<{ id: string }>().id;
  }
  await memberOf('WEB', 'grace');
  await memberOf('OPS', 'margaret');
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/zip' },
    payload: testPackage({ manifest: MANIFEST, run: RUN }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  const approved = await call('ada', 'POST', '/api/v1/plugins/time-tracking/approve', {
    packageSha256: await packageSha256Of(context.database, 'time-tracking'),
    projects: ['WEB'],
  });
  expect(approved.statusCode, approved.body).toBe(204);
});

afterAll(async () => {
  await app.close();
});

describe('a plugin asking whether someone holds one of its permissions', () => {
  it('is told of the person it acts for, in a project for one of projects, as their roles say', async () => {
    const log = { personId: ids['grace'], permission: 'entries.log', projectId: ids['WEB'] };
    const read = { personId: ids['grace'], permission: 'reports.read' };

    expect([await asks('grace', log), await asks('grace', read)]).toStrictEqual([
      { answer: false },
      { answer: false },
    ]);
    await grantTeam(LOG, READ);
    expect([await asks('grace', log), await asks('grace', read)]).toStrictEqual([
      { answer: true },
      { answer: true },
    ]);
  });

  it.each<[string, { personId: string; permission: string; projectId?: string }, string]>([
    ['about someone else', { personId: 'ada', permission: 'reports.read' }, 'FORBIDDEN'],
    [
      'about a permission of Toppo’s',
      { personId: 'grace', permission: 'issue.read', projectId: 'WEB' },
      'PERMISSION_NOT_FOUND',
    ],
    [
      'about a permission of projects in no project',
      { personId: 'grace', permission: 'entries.log' },
      'PERMISSION_SCOPE',
    ],
    [
      'about a permission of the instance in a project',
      { personId: 'grace', permission: 'reports.read', projectId: 'WEB' },
      'PERMISSION_SCOPE',
    ],
    [
      'in a project it does not act in',
      { personId: 'grace', permission: 'entries.log', projectId: 'OPS' },
      'PROJECT_NOT_FOUND',
    ],
  ])('is refused, acting for someone, %s', async (_, { personId, projectId, permission }, code) => {
    const args = {
      personId: ids[personId],
      permission,
      ...(projectId ? { projectId: ids[projectId] } : {}),
    };

    expect(await asks('grace', args)).toStrictEqual({ refused: code });
  });

  it('is told, as itself, of the people of its projects only, a deactivated account holding none', async () => {
    const read = (personId: string) => asksAsItself({ personId, permission: 'reports.read' });
    await grantTeam(READ);

    expect(await read(ids['ada'] ?? '')).toBe(true);
    expect(await read(ids['grace'] ?? '')).toBe(true);
    // Margaret works in OPS only, where the plugin does not act.
    await expect(read(ids['margaret'] ?? '')).rejects.toMatchObject({ code: 'PERSON_NOT_FOUND' });
    const deactivated = await call('ada', 'POST', `/api/v1/users/${ids['grace']}/deactivate`);
    expect(deactivated.statusCode, deactivated.body).toBe(204);
    expect(await read(ids['grace'] ?? '')).toBe(false);
  });
});
