import { apiErrorSchema, meResponseSchema } from '@toppo/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildTestApp,
  cookieHeader,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';
import type { ZodTypeProvider } from '../http/zod.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
/** One session shared by tests that only read it: sign-in is rate limited to 5 per minute. */
let sessionCookie: string;

const ORIGIN = 'http://localhost:3000';
const EMAIL = 'ada@example.com';
const PASSWORD = 'correct horse battery staple';

function signIn(email: string, password: string, origin = ORIGIN) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin },
    body: { email, password },
  });
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const privateRoute = {
    config: { access: 'authenticated' },
    schema: { response: { 200: z.object({ email: z.string() }) } },
  } as const;
  const whoAmI = (request: FastifyRequest) => ({ email: request.actor?.email ?? '' });
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.get('/api/test/private', privateRoute, whoAmI);
  routes.post(
    '/api/test/private',
    { ...privateRoute, schema: { ...privateRoute.schema, body: z.object({ title: z.string() }) } },
    whoAmI,
  );

  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: EMAIL, password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  return () => app.close();
});

describe('signing in', () => {
  it('opens a session in an HttpOnly, SameSite cookie', async () => {
    const response = await signIn(EMAIL, PASSWORD);
    sessionCookie = cookieHeader(response);

    expect(response.statusCode).toBe(200);
    const session = response.cookies.find((cookie) => cookie.name === 'toppo.session_token');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
    // Plain HTTP (a LAN install): a Secure cookie would never be sent back.
    expect(session?.secure).toBeFalsy();
  });

  it('never sends Toppo’s own user columns back', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { cookie: sessionCookie },
    });

    expect(response.json().user).toMatchObject({ email: EMAIL });
    expect(response.json().user).not.toHaveProperty('instanceRoleId');
    expect(response.json().user).not.toHaveProperty('deactivatedAt');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await signIn(EMAIL, 'not the right password');
    const unknownEmail = await signIn('nobody@example.com', PASSWORD);

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toStrictEqual(wrongPassword.json());
    expect(wrongPassword.cookies).toHaveLength(0);
  });

  it('refuses a sign-in posted from another site', async () => {
    const response = await signIn(EMAIL, PASSWORD, 'https://evil.example.com');

    expect(response.statusCode).toBe(403);
    expect(response.cookies).toHaveLength(0);
  });
});

describe('the current user', () => {
  it('is null without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/me' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ user: null });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('is returned for a valid session, without internal fields', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(meResponseSchema.parse(response.json()).user).toMatchObject({
      name: 'Ada Lovelace',
      email: EMAIL,
    });
    expect(Object.keys(response.json().user).sort()).toStrictEqual([
      'email',
      'emailedEvents',
      'id',
      'locale',
      'managesProjects',
      'name',
      'permissions',
    ]);
  });

  it('is gone once signed out', async () => {
    const cookie = cookieHeader(await signIn(EMAIL, PASSWORD));

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: ORIGIN },
      body: {},
    });
    expect(signOut.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(me.json()).toStrictEqual({ user: null });
    const privateRoute = await app.inject({
      method: 'GET',
      url: '/api/test/private',
      headers: { cookie },
    });
    expect(privateRoute.statusCode).toBe(401);
  });

  it('ignores a forged session cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: 'toppo.session_token=forged.signature' },
    });

    expect(response.json()).toStrictEqual({ user: null });
  });
});

describe('routes for signed-in users only', () => {
  it('refuse anonymous callers before looking at their request', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/test/private',
      headers: { origin: ORIGIN },
      body: { not: 'what the route expects' },
    });

    expect(response.statusCode).toBe(401);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('know who is calling', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test/private',
      headers: { cookie: sessionCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({ email: EMAIL });
  });
});

describe('exposed authentication endpoints', () => {
  it.each([
    ['POST', '/api/auth/sign-up/email'],
    // Better Auth's own landing for reset links: Toppo's links open the web app instead.
    ['GET', '/api/auth/reset-password/abcdefghijklmnopqrstuvwx'],
    ['POST', '/api/auth/delete-user'],
    ['GET', '/api/auth/list-sessions'],
  ] as const)('%s %s is not reachable', async (method, url) => {
    const response = await app.inject({ method, url, headers: { origin: ORIGIN }, body: {} });

    expect(response.statusCode).toBe(404);
  });
});
