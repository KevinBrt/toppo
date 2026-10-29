import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  packageSha256Of,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * A plugin's screens: listed to those who may open them, served in a frame of their own under a
 * CSP that reaches nothing, their bundle and Toppo's runtime loaded without a session.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies: Record<string, string> = {};
const ids: Record<string, string> = {};

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const SCREENS = '/* the plugin’s screens */';

const words = {
  plugin: { name: 'Time tracking', description: 'Time.' },
  permissions: { log: 'Log time', read: 'Read reports' },
  pages: { report: 'Time', audit: 'Audit', budgets: 'Budgets' },
  panels: { entries: 'Time spent' },
};

const MANIFEST = testManifest({
  needs: ['issue.read'],
  permissions: {
    'entries.log': { scope: 'project', label: 'permissions.log' },
    'reports.read': { scope: 'instance', label: 'permissions.read' },
  },
  messages: { en: words, fr: words },
  pages: [
    {
      name: 'report',
      zone: 'main',
      access: 'authenticated',
      title: 'pages.report',
      nav: { label: 'pages.report', icon: 'clock' },
    },
    {
      name: 'audit',
      zone: 'settings',
      access: { permission: 'reports.read' },
      title: 'pages.audit',
      nav: { label: 'pages.audit', icon: 'list' },
    },
    {
      name: 'budgets',
      zone: 'project.settings',
      access: { permission: 'project.settings.manage' },
      title: 'pages.budgets',
      nav: { label: 'pages.budgets', icon: 'wallet' },
    },
  ],
  panels: [{ name: 'entries', on: 'issue', access: 'authenticated', title: 'panels.entries' }],
});

function call(who: string | null, url: string) {
  return app.inject({
    method: 'GET',
    url,
    headers: who === null ? {} : { origin: ORIGIN, cookie: cookies[who] ?? '' },
  });
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

async function upload(zip: Buffer) {
  return await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/zip' },
    payload: zip,
  });
}

async function post(url: string, body: unknown) {
  const response = await app.inject({
    method: 'POST',
    url,
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/json' },
    payload: JSON.stringify(body),
  });
  expect(response.statusCode, response.body).toBeLessThan(300);
  return response;
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
  for (const key of ['WEB', 'OPS']) {
    await post('/api/v1/projects', { key, name: key });
    ids[`${key}-1`] = (
      await post(`/api/v1/projects/${key}/issues`, { title: 'Invoices fail to download' })
    ).json<{ id: string }>().id;
  }
  // Grace works in WEB only, with the team role; Linus in no project.
  ids['grace'] = await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  ids['linus'] = await createTestUser(context.database, {
    name: 'Linus Torvalds',
    email: 'linus@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  await signIn('grace', 'grace@example.com');
  await post('/api/v1/projects/WEB/members', { userIds: [ids['grace']], roleId: null });
  expect((await upload(testPackage({ manifest: MANIFEST, screens: SCREENS }))).statusCode).toBe(
    201,
  );
  await post('/api/v1/plugins/time-tracking/approve', {
    packageSha256: await packageSha256Of(context.database, 'time-tracking'),
    projects: ['WEB'],
  });
});

afterAll(async () => {
  await app.close();
});

describe('a plugin’s screens', () => {
  it('need their bundle in its zip', async () => {
    const refused = await upload(testPackage({ manifest: { ...MANIFEST, id: 'no-screens' } }));

    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      error: { code: 'PLUGIN_PACKAGE_INVALID', message: expect.stringContaining('web.js') },
    });
  });

  it('are listed to those who may open them, in the main sidebar and the settings', async () => {
    const entry = (name: string, label: string, icon: string) => ({
      pluginSlug: 'time-tracking',
      plugin: { en: 'Time tracking', fr: 'Time tracking' },
      name,
      title: { en: label, fr: label },
      entry: { label: { en: label, fr: label }, icon },
    });

    expect((await call('ada', '/api/v1/plugin-screens')).json()).toStrictEqual({
      main: [entry('report', 'Time', 'clock')],
      settings: [entry('audit', 'Audit', 'list')],
    });
    // Grace's role gives her no reports.
    expect((await call('grace', '/api/v1/plugin-screens')).json()).toStrictEqual({
      main: [entry('report', 'Time', 'clock')],
      settings: [],
    });
  });

  it('show in the projects the plugin acts in, to those who may open them there', async () => {
    const tabs = async (who: string, key: string) =>
      (await call(who, `/api/v1/projects/${key}/plugin-screens`))
        .json<{ screens: { name: string }[] }>()
        .screens.map(({ name }) => name);

    expect(await tabs('ada', 'WEB')).toStrictEqual(['budgets']);
    expect(await tabs('ada', 'OPS')).toStrictEqual([]);
    expect(await tabs('grace', 'WEB')).toStrictEqual([]);
    expect((await call('ada', '/api/v1/issues/WEB-1/plugin-panels')).json()).toMatchObject({
      issue: { id: ids['WEB-1'], key: 'WEB-1', projectKey: 'WEB' },
      screens: [{ name: 'entries', title: { en: 'Time spent' }, entry: null }],
    });
    expect((await call('ada', '/api/v1/issues/OPS-1/plugin-panels')).json()).toMatchObject({
      screens: [],
    });
    expect((await call('grace', '/api/v1/issues/OPS-1/plugin-panels')).statusCode).toBe(404);
  });

  it('are served in a frame reaching nothing, to whoever may open them', async () => {
    const frame = await call('ada', '/plugin-screens/time-tracking/report');

    expect(frame.statusCode).toBe(200);
    expect(frame.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(frame.headers['content-security-policy']).toBe(
      "sandbox allow-scripts allow-forms; default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-src 'none'; frame-ancestors 'self'",
    );
    expect(frame.headers['cache-control']).toBe('private, no-store');
    expect(frame.body).toContain('data-screen="report"');
    expect(frame.body).toContain('<script defer src="/plugin-runtime/runtime.js?v=test-runtime">');
    expect(frame.body).toMatch(
      /<script defer src="\/plugin-screens\/time-tracking\/web\.js\?v=[0-9a-f]{16}">/,
    );
    expect(
      (await call('ada', '/plugin-screens/time-tracking/entries?issue=WEB-1')).statusCode,
    ).toBe(200);
    expect(
      (await call('ada', '/plugin-screens/time-tracking/budgets?project=WEB')).statusCode,
    ).toBe(200);
  });

  it.each([
    ['a page its permission keeps from them', 'grace', '/plugin-screens/time-tracking/audit'],
    ['a screen the plugin has not', 'ada', '/plugin-screens/time-tracking/nothing'],
    ['a panel without its issue', 'ada', '/plugin-screens/time-tracking/entries'],
    [
      'a panel where the plugin does not act',
      'ada',
      '/plugin-screens/time-tracking/entries?issue=OPS-1',
    ],
    [
      'a panel of an issue they do not see',
      'grace',
      '/plugin-screens/time-tracking/entries?issue=OPS-1',
    ],
    [
      'a tab where the plugin does not act',
      'ada',
      '/plugin-screens/time-tracking/budgets?project=OPS',
    ],
    ['a tab they may not open there', 'grace', '/plugin-screens/time-tracking/budgets?project=WEB'],
  ])('are not found: %s', async (_, who, url) => {
    expect((await call(who, url)).statusCode).toBe(404);
  });

  it('are served to the signed-in only', async () => {
    expect((await call(null, '/plugin-screens/time-tracking/report')).statusCode).toBe(401);
  });

  it('load their bundle and Toppo’s runtime without a session, for frames without an origin', async () => {
    const bundle = await call(null, '/plugin-screens/time-tracking/web.js?v=1');
    const runtime = await call(null, '/plugin-runtime/runtime.js?v=test-runtime');

    for (const script of [bundle, runtime]) {
      expect(script.statusCode).toBe(200);
      expect(script.headers['content-type']).toBe('text/javascript; charset=utf-8');
      expect(script.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(script.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    }
    expect(bundle.body).toBe(SCREENS);
    expect(runtime.body).toBe('/* runtime.js */');
    expect((await call(null, '/plugin-runtime/runtime.css')).headers['content-type']).toBe(
      'text/css; charset=utf-8',
    );
    expect((await call(null, '/plugin-runtime/elsewhere.js')).statusCode).toBe(400);
  });

  it('load their bundle 120 times a minute at most from one client, being public', async () => {
    await context.database.db.delete(schema.rateLimitCounters);
    try {
      for (let n = 0; n < 120; n += 1) {
        expect((await call(null, '/plugin-screens/time-tracking/web.js')).statusCode).toBe(200);
      }
      expect((await call(null, '/plugin-screens/time-tracking/web.js')).statusCode).toBe(429);
    } finally {
      await context.database.db.delete(schema.rateLimitCounters);
    }
  });

  it('are not served once their plugin is disabled', async () => {
    await post('/api/v1/plugins/time-tracking/disable', {});
    try {
      expect((await call(null, '/plugin-screens/time-tracking/web.js')).statusCode).toBe(404);
      expect((await call('ada', '/plugin-screens/time-tracking/report')).statusCode).toBe(404);
      expect((await call('ada', '/api/v1/plugin-screens')).json()).toStrictEqual({
        main: [],
        settings: [],
      });
    } finally {
      await post('/api/v1/plugins/time-tracking/enable', {});
    }
  });
});

describe('the names of people a screen shows', () => {
  it('are those of people sharing a project with whoever asks, the others left out', async () => {
    const [pluginUser] = await context.database.db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.pluginSlug, 'time-tracking'));
    const asked = [ids['grace'], ids['linus'], pluginUser?.id].join(',');

    const seen = await call('grace', `/api/v1/people?ids=${asked}`);

    expect(seen.statusCode).toBe(200);
    expect(seen.json()).toStrictEqual({ people: [{ id: ids['grace'], name: 'Grace Hopper' }] });
    expect((await call('grace', '/api/v1/people?ids=ada')).statusCode).toBe(400);
    expect((await call(null, `/api/v1/people?ids=${ids['grace']}`)).statusCode).toBe(401);
  });
});
