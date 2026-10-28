import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { instanceVersionResponseSchema, TOPPO_VERSION } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { createJobs } from '../../app.ts';
import { runNextJob, type WorkerContext } from '../../platform/jobs/job-worker.ts';
import type { ReleaseFeed } from '../../platform/updates/release-feed.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestPackageStore,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies = { admin: '', member: '' };

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const NEWER = { version: '99.0.0', url: 'https://github.com/KevinBrt/toppo/releases/tag/v99.0.0' };

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

async function versionFor(cookie: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/api/v1/instance/version',
    headers: { origin: ORIGIN, cookie },
  });
  expect(response.statusCode).toBe(200);
  return instanceVersionResponseSchema.parse(response.json());
}

/** The daily check, run now with `releases` as what it learns. */
async function check(releases: ReleaseFeed): Promise<void> {
  const worker: WorkerContext = {
    db: context.database.db,
    jobs: createJobs({
      files: await createTestFileStorage(),
      packages: await createTestPackageStore(),
    }),
    log: app.log,
    services: testServices({ releases }),
  };
  await context.database.db.insert(schema.jobs).values({ type: 'updates.check' });
  while (await runNextJob(worker)) {
    // Until none is due.
  }
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
  await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  cookies.admin = await signIn('ada@example.com');
  cookies.member = await signIn('grace@example.com');
  return () => app.close();
});

describe('the version of the instance', () => {
  it('is told to everyone signed in, and to nobody else', async () => {
    expect(await versionFor(cookies.member)).toStrictEqual({
      version: TOPPO_VERSION,
      update: null,
    });
    const signedOut = await app.inject({
      method: 'GET',
      url: '/api/v1/instance/version',
      headers: { origin: ORIGIN },
    });
    expect(signedOut.statusCode).toBe(401);
  });

  it('comes with a newer one for whoever manages the instance, once the daily check found it', async () => {
    expect((await versionFor(cookies.admin)).update).toBeNull();

    await check({ enabled: true, latest: () => Promise.resolve(NEWER) });

    expect(await versionFor(cookies.admin)).toStrictEqual({
      version: TOPPO_VERSION,
      update: NEWER,
    });
    expect((await versionFor(cookies.member)).update).toBeNull();
  });

  it('keeps what it knew when GitHub cannot be reached', async () => {
    await check({ enabled: true, latest: () => Promise.resolve(NEWER) });
    await check({ enabled: true, latest: () => Promise.reject(new Error('Offline')) });

    expect((await versionFor(cookies.admin)).update).toStrictEqual(NEWER);
  });

  it('offers nothing when the latest is the version running, or none is released', async () => {
    await check({
      enabled: true,
      latest: () => Promise.resolve({ version: TOPPO_VERSION, url: NEWER.url }),
    });
    expect((await versionFor(cookies.admin)).update).toBeNull();

    await check({ enabled: true, latest: () => Promise.resolve(null) });
    expect((await versionFor(cookies.admin)).update).toBeNull();
  });

  it('forgets what it knew once the check is turned off', async () => {
    await check({ enabled: true, latest: () => Promise.resolve(NEWER) });
    await check({ enabled: false, latest: () => Promise.reject(new Error('Never asked')) });

    expect((await versionFor(cookies.admin)).update).toBeNull();
  });
});
