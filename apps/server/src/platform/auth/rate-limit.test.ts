import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, setupTestDatabase, TEST_SETUP_CODE } from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;

const EMAIL = 'ada@example.com';
const ATTEMPTS_PER_MINUTE = 5;

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada', email: EMAIL, password: 'correct horse battery staple' },
    },
  });
  return () => app.close();
});

describe('sign-in rate limit', () => {
  it('blocks password guessing, even when the client forges forwarding headers', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= ATTEMPTS_PER_MINUTE; attempt++) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        headers: {
          origin: 'http://localhost:3000',
          // A different forged address on every attempt must not reset the counter.
          'x-forwarded-for': `203.0.113.${attempt}`,
          'x-toppo-client-ip': `198.51.100.${attempt}`,
        },
        body: { email: EMAIL, password: `guess number ${attempt}!` },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses.slice(0, ATTEMPTS_PER_MINUTE)).toStrictEqual(
      Array(ATTEMPTS_PER_MINUTE).fill(401),
    );
    expect(statuses.at(-1)).toBe(429);
  });
});

describe('behind a reverse proxy', () => {
  let proxied: FastifyInstance;

  beforeAll(async () => {
    proxied = await buildTestApp({ database: context.database, trustProxy: true });
    return () => proxied.close();
  });

  /** A sign-in through a proxy that appends the real client to what the client sent. */
  const signInThrough = (forged: string, client: string) =>
    proxied.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      remoteAddress: '127.0.0.1',
      headers: { origin: 'http://localhost:3000', 'x-forwarded-for': `${forged}, ${client}` },
      body: { email: EMAIL, password: 'not the password, really' },
    });

  it('counts the client the proxy saw, whatever address the client claims', async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt <= ATTEMPTS_PER_MINUTE; attempt++) {
      statuses.push((await signInThrough(`203.0.113.${attempt}`, '192.0.2.10')).statusCode);
    }

    expect(statuses.slice(0, ATTEMPTS_PER_MINUTE)).toStrictEqual(
      Array(ATTEMPTS_PER_MINUTE).fill(401),
    );
    expect(statuses.at(-1)).toBe(429);
    expect((await signInThrough('192.0.2.10', '192.0.2.11')).statusCode).toBe(401);
  });
});
