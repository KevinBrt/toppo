import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { PLUGIN_PACKAGE_LIMITS } from '@toppo-tracker/plugin-sdk/protocol';
import {
  apiErrorSchema,
  PLUGINS_MAX,
  pluginDetailsResponseSchema,
  pluginsResponseSchema,
} from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobs } from '../../app.ts';
import { runNextJob } from '../../platform/jobs/job-worker.ts';
import { scheduleRecurringJobs } from '../../platform/jobs/jobs.ts';
import {
  createPackageStore,
  type PackageStore,
} from '../../platform/plugins/packages/package-store.ts';
import {
  TEST_PNG,
  testManifest,
  testPackage,
} from '../../platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';
import { PLUGIN_INSTALL_LOCK_KEY } from './commands/install-plugin.command.ts';

const context = setupTestDatabase();
const packagesRoot = mkdtempSync(join(tmpdir(), 'toppo-plugins-'));
let packages: PackageStore;
let app: FastifyInstance;
let adminCookie: string;
let teamCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST' | 'DELETE', url: string, body?: object, cookie = adminCookie) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie },
    ...(body ? { body } : {}),
  });
}

function upload(zip: Buffer | Readable, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip', ...headers },
    payload: zip,
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

async function install(zip: Buffer): Promise<void> {
  const response = await upload(zip);
  expect(response.statusCode, response.body).toBe(201);
  expect(response.json()).toStrictEqual({ slug: 'time-tracking' });
}

async function details(slug = 'time-tracking') {
  const response = await call('GET', `/api/v1/plugins/${slug}`);
  expect(response.statusCode).toBe(200);
  return pluginDetailsResponseSchema.parse(response.json());
}

async function listed() {
  const response = await call('GET', '/api/v1/plugins');
  expect(response.statusCode).toBe(200);
  return pluginsResponseSchema.parse(response.json()).plugins;
}

async function approve(projects: 'all' | string[]): Promise<void> {
  const response = await call('POST', '/api/v1/plugins/time-tracking/approve', { projects });
  expect(response.statusCode, response.body).toBe(204);
}

beforeAll(async () => {
  packages = await createPackageStore({ root: packagesRoot });
  app = await buildTestApp({ database: context.database, packages });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['OPS', 'Operations'],
  ]) {
    expect((await call('POST', '/api/v1/projects', { key, name })).statusCode).toBe(201);
  }
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await context.database.db.delete(schema.plugins);
});

describe('installing a plugin', () => {
  it('reads what its zip declares, keeps it under its hash, and waits for an approval', async () => {
    const zip = testPackage();
    const sha256 = createHash('sha256').update(zip).digest('hex');

    await install(zip);

    expect(existsSync(join(packagesRoot, 'time-tracking', `${sha256}.zip`))).toBe(true);
    expect(await listed()).toMatchObject([
      { slug: 'time-tracking', version: '1.2.0', state: 'pending' },
    ]);
    expect(await details()).toMatchObject({
      name: { en: 'Time tracking', fr: 'Suivi du temps' },
      description: { en: 'Time spent on each issue.', fr: 'Le temps passé sur chaque ticket.' },
      logoUrl: null,
      packageSha256: sha256,
      apiVersion: '^1.0',
      needs: ['issue.read', 'comment.create'],
      permissions: [
        {
          name: 'entries.log',
          scope: 'project',
          label: { en: 'Log time', fr: 'Saisir du temps' },
        },
      ],
      events: ['issue.statusChanged'],
      actions: ['timeEntry.log'],
      allProjects: false,
      projects: [],
      approval: null,
      failures: 0,
      lastFailure: null,
    });
  });

  it('keeps its logo, served to whoever may see it, at an address of its package', async () => {
    await install(
      testPackage({
        manifest: testManifest({ logo: 'logo.png' }),
        logo: { name: 'logo.png', bytes: TEST_PNG },
      }),
    );
    const { logoUrl } = await details();
    expect(logoUrl).toMatch(/^\/api\/v1\/plugins\/time-tracking\/logo\?v=[0-9a-f]{16}$/);
    expect((await listed())[0]?.logoUrl).toBe(logoUrl);

    const logo = await call('GET', logoUrl ?? '');
    expect(logo.statusCode).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');
    expect(logo.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(new Uint8Array(logo.rawPayload)).toStrictEqual(TEST_PNG);
    // Waiting for an approval, its logo tells nobody else it is there.
    expect((await call('GET', logoUrl ?? '', undefined, teamCookie)).statusCode).toBe(404);
    await approve('all');
    expect((await call('GET', logoUrl ?? '', undefined, teamCookie)).statusCode).toBe(200);
  });

  it('refuses a logo that is not the one its code names, or not what its name says', async () => {
    for (const zip of [
      testPackage({ logo: { name: 'logo.png', bytes: TEST_PNG } }),
      testPackage({ manifest: testManifest({ logo: 'logo.png' }) }),
      testPackage({
        manifest: testManifest({ logo: 'logo.webp' }),
        logo: { name: 'logo.webp', bytes: TEST_PNG },
      }),
      testPackage({
        manifest: testManifest({ logo: 'logo.png' }),
        logo: { name: 'logo.png', bytes: new TextEncoder().encode('<svg onload="x()">') },
      }),
    ]) {
      const refused = await upload(zip);
      expect(refused.statusCode).toBe(422);
      expect(errorCode(refused)).toBe('PLUGIN_PACKAGE_INVALID');
    }
    expect(await listed()).toStrictEqual([]);
  });

  it('runs once approved, in the projects chosen or in all of them', async () => {
    await install(testPackage());

    await approve(['WEB', 'OPS', 'WEB']);
    const approved = await details();
    expect(approved.state).toBe('enabled');
    expect(approved.projects.map(({ key }) => key)).toStrictEqual(['OPS', 'WEB']);
    expect(approved.approval?.by?.name).toBe('Ada Lovelace');

    await approve('all');
    expect(await details()).toMatchObject({ state: 'enabled', allProjects: true, projects: [] });
  });

  it('refuses an approval in a project that does not exist, changing nothing', async () => {
    await install(testPackage());

    const refused = await call('POST', '/api/v1/plugins/time-tracking/approve', {
      projects: ['WEB', 'NOPE'],
    });

    expect(refused.statusCode).toBe(404);
    expect(errorCode(refused)).toBe('PROJECT_NOT_FOUND');
    expect(await details()).toMatchObject({ state: 'pending', approval: null, projects: [] });
  });

  it('is disabled and enabled again, as it was approved', async () => {
    await install(testPackage());
    const enable = () => call('POST', '/api/v1/plugins/time-tracking/enable');
    const waiting = await enable();
    expect(waiting.statusCode).toBe(409);
    expect(errorCode(waiting)).toBe('PLUGIN_NOT_APPROVED');
    await approve(['WEB']);

    expect((await call('POST', '/api/v1/plugins/time-tracking/disable')).statusCode).toBe(204);
    expect((await details()).state).toBe('disabled');
    expect((await enable()).statusCode).toBe(204);
    expect(await details()).toMatchObject({ state: 'enabled', projects: [{ key: 'WEB' }] });
  });

  it('upgrades in place when the new version asks for no more', async () => {
    await install(testPackage());
    await approve(['WEB']);
    const before = await details();

    await install(testPackage({ version: '1.3.0', manifest: testManifest({ events: [] }) }));

    const after = await details();
    expect(after).toMatchObject({ version: '1.3.0', state: 'enabled', events: [] });
    expect(after.approval).toStrictEqual(before.approval);
    expect(after.packageSha256).not.toBe(before.packageSha256);
  });

  it('waits for a new approval, disabled, when an upgrade asks for more', async () => {
    await install(testPackage({ manifest: testManifest({ needs: ['issue.read'] }) }));
    await approve(['WEB']);

    await install(testPackage({ version: '2.0.0' }));

    expect(await details()).toMatchObject({ version: '2.0.0', state: 'pending', approval: null });
    expect((await call('POST', '/api/v1/plugins/time-tracking/enable')).statusCode).toBe(409);
    await approve(['WEB']);
    expect((await details()).state).toBe('enabled');
  });

  it('is uninstalled, its zip swept within the hour', async () => {
    const zip = testPackage();
    const file = join(
      packagesRoot,
      'time-tracking',
      `${createHash('sha256').update(zip).digest('hex')}.zip`,
    );
    await install(zip);

    expect((await call('DELETE', '/api/v1/plugins/time-tracking')).statusCode).toBe(204);

    expect(await listed()).toStrictEqual([]);
    const hoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(file, hoursAgo, hoursAgo);
    // The sweep runs as a recurring job, by whichever worker comes first, among the others due.
    const worker = {
      db: context.database.db,
      jobs: createJobs({ files: await createTestFileStorage(), packages }),
      log: app.log,
      services: testServices(),
    };
    await scheduleRecurringJobs(context.database.db, worker.jobs);
    while (await runNextJob(worker)) {
      // Until none is due.
    }
    expect(existsSync(file)).toBe(false);
    for (const response of [
      await call('GET', '/api/v1/plugins/time-tracking'),
      await call('DELETE', '/api/v1/plugins/time-tracking'),
      await call('POST', '/api/v1/plugins/time-tracking/disable'),
      await call('POST', '/api/v1/plugins/time-tracking/approve', { projects: 'all' }),
    ]) {
      expect(response.statusCode).toBe(404);
      expect(errorCode(response)).toBe('PLUGIN_NOT_FOUND');
    }
  });

  it('refuses a name that is not a plugin id', async () => {
    const refused = await call('GET', '/api/v1/plugins/Time_Tracking');

    expect(refused.statusCode).toBe(400);
    expect(errorCode(refused)).toBe('VALIDATION_FAILED');
  });

  it('is for administrators only', async () => {
    const refused = await call('GET', '/api/v1/plugins', undefined, teamCookie);

    expect(refused.statusCode).toBe(403);
  });
});

describe('a zip that is no plugin Toppo runs', () => {
  it.each([
    ['not a zip', Buffer.from('not a zip'), 'PLUGIN_PACKAGE_INVALID'],
    [
      'a zip of other files',
      testPackage({ files: { 'index.js': new Uint8Array([1]) } }),
      'PLUGIN_PACKAGE_INVALID',
    ],
    [
      'code that fails as it loads',
      testPackage({
        files: {
          'server.js': new TextEncoder().encode('throw new Error("Broken on purpose");'),
          'plugin.json': new TextEncoder().encode('{"version":"1.0.0"}'),
        },
      }),
      'PLUGIN_MANIFEST_UNREADABLE',
    ],
    [
      'a manifest Toppo refuses',
      testPackage({ manifest: { ...testManifest(), unknown: true } }),
      'PLUGIN_MANIFEST_INVALID',
    ],
    [
      'an action on an issue from a plugin that does not read issues',
      testPackage({
        manifest: testManifest({
          needs: ['comment.create'],
          actions: [{ name: 'timeEntry.log', access: { issue: 'issueId' }, input: {} }],
        }),
      }),
      'PLUGIN_MANIFEST_INVALID',
    ],
    [
      'an API this Toppo does not speak',
      testPackage({ manifest: testManifest({ apiVersion: '^2.0' }) }),
      'PLUGIN_API_INCOMPATIBLE',
    ],
    [
      'a name of Toppo’s own',
      testPackage({ manifest: testManifest({ id: 'issue' }) }),
      'PLUGIN_ID_RESERVED',
    ],
  ])('is refused when it is %s, and nothing is installed', async (_, zip, code) => {
    const refused = await upload(zip);

    expect(refused.statusCode).toBe(422);
    expect(errorCode(refused)).toBe(code);
    expect(await listed()).toStrictEqual([]);
  });

  it('is taken as a zip only, with its length, within the size of a package', async () => {
    const json = await call('POST', '/api/v1/plugins', { zip: 'UEsDBA==' });
    expect(json.statusCode).toBe(415);

    const unsized = await upload(Readable.from([testPackage()]));
    expect(unsized.statusCode).toBe(411);
    expect(errorCode(unsized)).toBe('LENGTH_REQUIRED');

    const large = await upload(testPackage(), {
      'content-length': String(PLUGIN_PACKAGE_LIMITS.packageBytes + 1),
    });
    expect(large.statusCode).toBe(413);
    expect(errorCode(large)).toBe('PLUGIN_TOO_LARGE');
  });

  it('is installed one at a time', async () => {
    let refused: LightMyRequestResponse | undefined;
    await context.database.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(${PLUGIN_INSTALL_LOCK_KEY})`);
      refused = await upload(testPackage());
    });

    expect(refused?.statusCode).toBe(409);
    expect(refused ? errorCode(refused) : null).toBe('PLUGIN_INSTALL_RUNNING');
    await install(testPackage());
  });

  it('is refused past the plugins an instance runs, but an upgrade is not', async () => {
    await context.database.db.insert(schema.plugins).values(
      Array.from({ length: PLUGINS_MAX - 1 }, (_, index) => ({
        slug: `plugin-${index}`,
        version: '1.0.0',
        manifest: {},
        packageSha256: 'a'.repeat(64),
      })),
    );
    await install(testPackage());

    const refused = await upload(testPackage({ manifest: testManifest({ id: 'one-more' }) }));
    expect(refused.statusCode).toBe(409);
    expect(errorCode(refused)).toBe('PLUGIN_LIMIT_REACHED');
    await install(testPackage({ version: '1.3.0' }));
  });
});
