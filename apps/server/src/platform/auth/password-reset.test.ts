import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  meResponseSchema,
  passwordResetAvailabilityResponseSchema,
} from '@toppo-tracker/shared';
import { startSmtpServer, type TestSmtpServer } from '@toppo-tracker/testing';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJobs } from '../../app.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestFileStorage,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
  testServices,
} from '../../test-helpers.ts';
import { runNextJob, type WorkerContext } from '../jobs/job-worker.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let mailServer: TestSmtpServer;
let worker: WorkerContext;
let graceId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase for grace';
const GRACE = 'grace@example.com';

function post(url: string, body: object, cookie = '') {
  return app.inject({ method: 'POST', url, headers: { origin: ORIGIN, cookie }, body });
}

const askReset = (email: string) => post('/api/auth/request-password-reset', { email });
const reset = (token: string, newPassword = NEW_PASSWORD) =>
  post('/api/auth/reset-password', { token, newPassword });
const signIn = (email: string, password: string) =>
  post('/api/auth/sign-in/email', { email, password });

/** Runs every job due: the emails asked for leave. */
async function deliver(): Promise<void> {
  while (await runNextJob(worker)) {
    // Until none is due.
  }
}

/** The token of the last link emailed to `address`. */
function lastTokenSentTo(address: string): string {
  const mail = mailServer.received.findLast(({ to }) => to.includes(address));
  const token = /\/reset-password#([\w-]+)/u.exec(mail?.content ?? '')?.[1];
  if (!token) {
    throw new Error(`No reset link was emailed to ${address}`);
  }
  return token;
}

async function setUpEmail(): Promise<void> {
  await context.database.db
    .insert(schema.mailSettings)
    .values({
      host: '127.0.0.1',
      port: mailServer.port,
      security: 'none',
      fromAddress: 'toppo@example.com',
      fromName: 'Toppo',
    })
    .onConflictDoNothing();
}

beforeAll(async () => {
  mailServer = await startSmtpServer();
  app = await buildTestApp({ database: context.database });
  worker = {
    db: context.database.db,
    jobs: createJobs({ files: await createTestFileStorage() }),
    log: app.log,
    services: testServices(),
  };
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
    email: GRACE,
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
});

afterAll(async () => {
  await app.close();
  await mailServer.close();
});

beforeEach(async () => {
  // Each test asks and signs in a few times: more than a client may in a few minutes.
  await context.database.db.delete(schema.rateLimits);
  await context.database.db.delete(schema.rateLimitCounters);
  await setUpEmail();
});

describe('resetting a forgotten password', () => {
  it('answers the same for any address, and emails a link to an account only', async () => {
    const before = mailServer.received.length;

    expect((await askReset(GRACE)).statusCode).toBe(204);
    expect((await askReset('nobody@example.com')).statusCode).toBe(204);
    await deliver();

    const sent = mailServer.received.slice(before);
    expect(sent.map(({ to }) => to)).toStrictEqual([[GRACE]]);
    expect(sent[0]?.subject).toBe('Choose a new Toppo password');
    expect(sent[0]?.content).toContain('http://localhost:3000/reset-password#');
  });

  it('sets the new password with the link, once, and signs every device out', async () => {
    const elsewhere = cookieHeader(await signIn(GRACE, PASSWORD));
    await askReset(GRACE);
    await deliver();
    const token = lastTokenSentTo(GRACE);

    expect((await reset(token)).statusCode).toBe(204);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: elsewhere },
    });
    expect(meResponseSchema.parse(me.json()).user).toBeNull();
    expect((await signIn(GRACE, PASSWORD)).statusCode).toBe(401);
    expect((await signIn(GRACE, NEW_PASSWORD)).statusCode).toBe(200);
    const again = await reset(token, 'yet another long passphrase');
    expect(again.statusCode).toBe(400);
    expect(apiErrorSchema.parse(again.json()).error.code).toBe('INVALID_RESET_LINK');
  });

  it('keeps only a hash of each token', async () => {
    await askReset(GRACE);
    await deliver();
    const token = lastTokenSentTo(GRACE);

    const stored = await context.database.db
      .select({ identifier: schema.verifications.identifier })
      .from(schema.verifications);
    expect(stored.length).toBeGreaterThan(0);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('refuses a weak password or a malformed link before trying it', async () => {
    for (const refused of [await reset('abc', 'short'), await reset('not a token!')]) {
      expect(refused.statusCode).toBe(400);
      expect(apiErrorSchema.parse(refused.json()).error.code).toBe('VALIDATION_FAILED');
    }
    const unknown = await reset('unknownTokenOfTheRightShape');
    expect(apiErrorSchema.parse(unknown.json()).error.code).toBe('INVALID_RESET_LINK');
  });

  it('emails nothing to a deactivated account', async () => {
    await context.database.db
      .update(schema.users)
      .set({ deactivatedAt: sql`now()` })
      .where(eq(schema.users.id, graceId));
    const before = mailServer.received.length;

    expect((await askReset(GRACE)).statusCode).toBe(204);
    await deliver();
    await context.database.db
      .update(schema.users)
      .set({ deactivatedAt: null })
      .where(eq(schema.users.id, graceId));

    expect(mailServer.received.slice(before)).toStrictEqual([]);
  });

  it('is not offered, and makes no link, while email is off', async () => {
    const availability = async () =>
      passwordResetAvailabilityResponseSchema.parse(
        (await app.inject({ method: 'GET', url: '/api/auth/password-reset' })).json(),
      ).available;
    expect(await availability()).toBe(true);
    await context.database.db.delete(schema.mailSettings);
    await context.database.db.delete(schema.verifications);

    expect(await availability()).toBe(false);
    expect((await askReset(GRACE)).statusCode).toBe(204);
    expect(await context.database.db.select().from(schema.verifications)).toStrictEqual([]);
  });
});
