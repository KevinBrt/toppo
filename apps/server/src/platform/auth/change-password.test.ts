import { apiErrorSchema, meResponseSchema } from '@toppo-tracker/shared';
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
/** Ada is signed in twice, on her laptop and on her phone. */
let laptopCookie: string;
let phoneCookie: string;

const ORIGIN = 'http://localhost:3000';
const EMAIL = 'ada@example.com';
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a brand new passphrase for ada';

/** Sign-in is rate limited to 5 per minute: this file signs in 4 times in all. */
async function signIn(password: string) {
  return await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email: EMAIL, password },
  });
}

function changePassword(cookie: string, body: object) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/change-password',
    headers: { origin: ORIGIN, cookie },
    body,
  });
}

async function currentUser(cookie: string) {
  const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
  return meResponseSchema.parse(response.json()).user;
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: EMAIL, password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  laptopCookie = cookieHeader(await signIn(PASSWORD));
  phoneCookie = cookieHeader(await signIn(PASSWORD));
  return () => app.close();
});

describe('POST /api/auth/change-password', () => {
  it('needs a session', async () => {
    const response = await changePassword('', {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses a new password Toppo would not accept, before Better Auth sees it', async () => {
    const response = await changePassword(laptopCookie, {
      currentPassword: PASSWORD,
      newPassword: 'too short',
    });

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('refuses a wrong current password', async () => {
    const response = await changePassword(laptopCookie, {
      currentPassword: 'not my password at all',
      newPassword: NEW_PASSWORD,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'INVALID_PASSWORD' });
    expect(await currentUser(phoneCookie)).toMatchObject({ email: EMAIL });
  });

  it('changes it and signs every other device out, whatever the client asks', async () => {
    const response = await changePassword(laptopCookie, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
      revokeOtherSessions: false,
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
    // The device that changed it carries on, in a new session.
    const renewedCookie = cookieHeader(response);
    expect(renewedCookie).toContain('toppo.session_token=');
    expect(await currentUser(renewedCookie)).toMatchObject({ email: EMAIL });
    expect(await currentUser(phoneCookie)).toBeNull();
    expect(await currentUser(laptopCookie)).toBeNull();
    expect((await signIn(PASSWORD)).statusCode).toBe(401);
    expect((await signIn(NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('is rate limited, as it tests the current password', async () => {
    // Four attempts so far: the fifth still reaches the session check, the sixth is turned away.
    const attempt = () =>
      changePassword(laptopCookie, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });

    expect((await attempt()).statusCode).toBe(401);
    const refused = await attempt();
    expect(refused.statusCode).toBe(429);
    expect(refused.headers['retry-after']).toBeDefined();
  });
});
