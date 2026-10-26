import { DEFAULT_ROLE_IDS } from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import {
  apiErrorSchema,
  type MailSettingsRequest,
  mailSettingsResponseSchema,
} from '@toppo/shared';
import { startSmtpServer, type TestSmtpServer } from '@toppo/testing';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createSecretBox } from '../../platform/config/secret-box.ts';
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
let open: TestSmtpServer;
let guarded: TestSmtpServer;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const CREDENTIALS = { username: 'toppo@example.com', password: 'mail password' };

function call(
  method: 'GET' | 'PUT' | 'POST' | 'DELETE',
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

/** Settings for a test mail server: one that takes mail from anyone, by default. */
function settings(overrides: Partial<MailSettingsRequest> = {}): MailSettingsRequest {
  return {
    host: '127.0.0.1',
    port: open.port,
    security: 'none',
    fromAddress: 'toppo@example.com',
    fromName: 'Toppo',
    ...overrides,
  };
}

async function save(body: MailSettingsRequest): Promise<void> {
  const response = await call('PUT', '/api/v1/settings/email', adminCookie, body);
  expect(response.statusCode).toBe(204);
}

async function saved() {
  const response = await call('GET', '/api/v1/settings/email', adminCookie);
  expect(response.statusCode).toBe(200);
  return mailSettingsResponseSchema.parse(response.json()).settings;
}

const sendTest = () => call('POST', '/api/v1/settings/email/test', adminCookie);

beforeAll(async () => {
  open = await startSmtpServer();
  guarded = await startSmtpServer(CREDENTIALS);
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
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
});

afterAll(async () => {
  await app.close();
  await open.close();
  await guarded.close();
});

// Each test sends a few test emails: more than one client may in ten minutes.
beforeEach(async () => {
  await context.database.db.delete(schema.rateLimits);
});

describe('the mail settings', () => {
  it('are none until saved, then read back without the password', async () => {
    await call('DELETE', '/api/v1/settings/email', adminCookie);
    expect(await saved()).toBeNull();

    await save(settings({ ...CREDENTIALS, port: guarded.port, security: 'starttls' }));

    expect(await saved()).toStrictEqual({
      host: '127.0.0.1',
      port: guarded.port,
      security: 'starttls',
      username: CREDENTIALS.username,
      passwordSet: true,
      fromAddress: 'toppo@example.com',
      fromName: 'Toppo',
    });
    const [row] = await context.database.db.select().from(schema.mailSettings);
    expect(row?.passwordSealed).not.toContain(CREDENTIALS.password);
  });

  it('keep the password saved when it is left out, and drop it with the user name', async () => {
    await save(settings({ ...CREDENTIALS, port: guarded.port }));
    await save(settings({ username: CREDENTIALS.username, port: guarded.port, fromName: 'Help' }));
    expect(await saved()).toMatchObject({ passwordSet: true, fromName: 'Help' });
    expect((await sendTest()).statusCode).toBe(204);

    await save(settings({ username: '' }));
    expect(await saved()).toMatchObject({ username: null, passwordSet: false });
  });

  it('ask for the password of a new account, and refuse what is not a mail server', async () => {
    await call('DELETE', '/api/v1/settings/email', adminCookie);
    const withoutPassword = await call(
      'PUT',
      '/api/v1/settings/email',
      adminCookie,
      settings({ username: 'someone' }),
    );
    expect(withoutPassword.statusCode).toBe(400);
    expect(errorCode(withoutPassword)).toBe('MAIL_PASSWORD_REQUIRED');

    for (const wrong of [
      settings({ host: 'smtp.example.com\r\nBcc: x@example.com' }),
      settings({ port: 0 }),
      settings({ fromAddress: 'not an address' }),
      settings({ fromName: '' }),
    ]) {
      const refused = await call('PUT', '/api/v1/settings/email', adminCookie, wrong);
      expect(refused.statusCode).toBe(400);
      expect(errorCode(refused)).toBe('VALIDATION_FAILED');
    }
  });

  it('keep a password left out for the same account on the same server only', async () => {
    await save(settings({ ...CREDENTIALS, port: guarded.port }));

    for (const elsewhere of [
      settings({ username: CREDENTIALS.username, port: open.port }),
      settings({ username: CREDENTIALS.username, port: guarded.port, host: 'localhost' }),
      settings({ username: CREDENTIALS.username, port: guarded.port, security: 'starttls' }),
      settings({ username: 'someone.else@example.com', port: guarded.port }),
    ]) {
      const refused = await call('PUT', '/api/v1/settings/email', adminCookie, elsewhere);
      expect(refused.statusCode).toBe(400);
      expect(errorCode(refused)).toBe('MAIL_PASSWORD_REQUIRED');
    }
    expect(await saved()).toMatchObject({ port: guarded.port, passwordSet: true });
  });

  it('are for administrators only, not for those who manage the other settings', async () => {
    const roleId = uuidv7();
    await context.database.db
      .insert(schema.roles)
      .values({ id: roleId, name: 'Settings', permissions: ['instance.settings.manage'] });
    await createTestUser(context.database, {
      name: 'Mary Settings',
      email: 'mary@example.com',
      password: PASSWORD,
      instanceRoleId: roleId,
    });
    const settingsCookie = await signIn('mary@example.com');

    for (const [method, url, body] of [
      ['GET', '/api/v1/settings/email', undefined],
      ['PUT', '/api/v1/settings/email', settings()],
      ['DELETE', '/api/v1/settings/email', undefined],
      ['POST', '/api/v1/settings/email/test', undefined],
    ] as const) {
      expect((await call(method, url, settingsCookie, body)).statusCode).toBe(403);
      expect((await call(method, url, teamCookie, body)).statusCode).toBe(403);
    }
  });
});

describe('the test email', () => {
  it('reaches the administrator, in their words, through the server saved', async () => {
    await save(settings());
    const before = open.received.length;

    expect((await sendTest()).statusCode).toBe(204);

    const [mail] = open.received.slice(before);
    expect(mail).toMatchObject({
      from: 'toppo@example.com',
      to: ['ada@example.com'],
      subject: 'Toppo can send email',
    });
    expect(mail?.content).toContain('This message was sent by Toppo (http://localhost:3000)');
  });

  it('speaks French to an administrator whose interface does', async () => {
    await save(settings());
    await context.database.db.update(schema.users).set({ locale: 'fr' });
    const before = open.received.length;

    expect((await sendTest()).statusCode).toBe(204);
    await context.database.db.update(schema.users).set({ locale: 'en' });

    const [mail] = open.received.slice(before);
    expect(mail?.subject).toBe('Toppo peut envoyer des emails');
    expect(mail?.content).toContain('Ce message a été envoyé par Toppo');
  });

  it('signs in when the server asks, and says when it refuses', async () => {
    await save(settings({ ...CREDENTIALS, port: guarded.port }));
    expect((await sendTest()).statusCode).toBe(204);

    await save(settings({ ...CREDENTIALS, password: 'wrong', port: guarded.port }));
    const refused = await sendTest();
    expect(refused.statusCode).toBe(422);
    expect(errorCode(refused)).toBe('MAIL_AUTHENTICATION_FAILED');
  });

  it('says when the server cannot be reached, or the password read', async () => {
    await save(settings({ port: 1 }));
    const unreachable = await sendTest();
    expect(unreachable.statusCode).toBe(422);
    expect(errorCode(unreachable)).toBe('MAIL_CONNECTION_FAILED');

    await save(settings({ ...CREDENTIALS, port: guarded.port }));
    const sealedElsewhere = createSecretBox('another instance key, long enough').seal('x');
    await context.database.db.update(schema.mailSettings).set({ passwordSealed: sealedElsewhere });
    const unreadable = await sendTest();
    expect(unreadable.statusCode).toBe(409);
    expect(errorCode(unreadable)).toBe('MAIL_PASSWORD_UNREADABLE');
  });

  it('says when email is not set up', async () => {
    expect((await call('DELETE', '/api/v1/settings/email', adminCookie)).statusCode).toBe(204);

    const refused = await sendTest();

    expect(refused.statusCode).toBe(409);
    expect(errorCode(refused)).toBe('MAIL_NOT_CONFIGURED');
    expect(await saved()).toBeNull();
  });
});
