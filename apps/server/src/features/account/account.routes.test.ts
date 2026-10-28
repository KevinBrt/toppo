import { apiErrorSchema, meResponseSchema, NOTIFICATION_EVENTS } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  cookieHeader,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let cookie: string;

const ORIGIN = 'http://localhost:3000';
const ADA = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  password: 'correct horse battery staple',
};

function rename(body: object, sessionCookie = cookie) {
  return app.inject({
    method: 'PATCH',
    url: '/api/v1/me',
    headers: { origin: ORIGIN, cookie: sessionCookie },
    body,
  });
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: { setupCode: TEST_SETUP_CODE, admin: ADA },
  });
  expect(setup.statusCode).toBe(201);
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email: ADA.email, password: ADA.password },
  });
  cookie = cookieHeader(signIn);
  return () => app.close();
});

describe('PATCH /api/v1/me', () => {
  it('renames the signed-in user, trimmed', async () => {
    const response = await rename({ name: '  Augusta Ada King  ' });

    expect(response.statusCode).toBe(204);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(meResponseSchema.parse(me.json()).user).toMatchObject({
      name: 'Augusta Ada King',
      email: ADA.email,
    });
  });

  it('never changes the address, whatever the body says', async () => {
    const response = await rename({ name: 'Ada', email: 'mallory@example.com' });

    expect(response.statusCode).toBe(204);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(meResponseSchema.parse(me.json()).user?.email).toBe(ADA.email);
  });

  it.each([{ name: '   ' }, { name: 'x'.repeat(101) }, {}])('refuses %j', async (body) => {
    const response = await rename(body);

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('needs a session', async () => {
    const response = await rename({ name: 'Mallory' }, '');

    expect(response.statusCode).toBe(401);
  });
});

describe('PUT /api/v1/me/locale', () => {
  const setLocale = (body: object, sessionCookie = cookie) =>
    app.inject({
      method: 'PUT',
      url: '/api/v1/me/locale',
      headers: { origin: ORIGIN, cookie: sessionCookie },
      body,
    });

  it('remembers the language the interface speaks, English until then', async () => {
    const before = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(meResponseSchema.parse(before.json()).user?.locale).toBe('en');

    expect((await setLocale({ locale: 'fr' })).statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(meResponseSchema.parse(after.json()).user?.locale).toBe('fr');
    expect((await setLocale({ locale: 'en' })).statusCode).toBe(204);
  });

  it('refuses a language the interface does not speak, and needs a session', async () => {
    const refused = await setLocale({ locale: 'de' });
    expect(refused.statusCode).toBe(400);
    expect(apiErrorSchema.parse(refused.json()).error.code).toBe('VALIDATION_FAILED');
    expect((await setLocale({ locale: 'fr' }, '')).statusCode).toBe(401);
  });
});

describe('PUT /api/v1/me/email-notifications', () => {
  const setEmails = (body: object, sessionCookie = cookie) =>
    app.inject({
      method: 'PUT',
      url: '/api/v1/me/email-notifications',
      headers: { origin: ORIGIN, cookie: sessionCookie },
      body,
    });
  const emailed = async () =>
    meResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })).json(),
    ).user?.emailedEvents;

  it('chooses which kinds of notifications are emailed, every kind by default', async () => {
    expect(await emailed()).toStrictEqual([...NOTIFICATION_EVENTS]);

    expect((await setEmails({ emailed: ['mentioned', 'assigned'] })).statusCode).toBe(204);
    expect(await emailed()).toStrictEqual(['assigned', 'mentioned']);
    expect((await setEmails({ emailed: [] })).statusCode).toBe(204);
    expect(await emailed()).toStrictEqual([]);
    expect((await setEmails({ emailed: [...NOTIFICATION_EVENTS] })).statusCode).toBe(204);
  });

  it('refuses an unknown kind or the same twice, and needs a session', async () => {
    expect((await setEmails({ emailed: ['everything'] })).statusCode).toBe(400);
    expect((await setEmails({ emailed: ['created', 'created'] })).statusCode).toBe(400);
    expect((await setEmails({ emailed: [] }, '')).statusCode).toBe(401);
  });
});
