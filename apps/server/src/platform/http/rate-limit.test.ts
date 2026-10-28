import { schema } from '@toppo-tracker/db';
import { apiErrorSchema } from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildTestApp, setupTestDatabase, testServices } from '../../test-helpers.ts';
import { clientOf, pruneRateLimitsJob } from './rate-limit.ts';
import type { ZodTypeProvider } from './zod.ts';

const context = setupTestDatabase();
let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const routes = app.withTypeProvider<ZodTypeProvider>();
  routes.post(
    '/api/test/limited',
    {
      config: { access: 'public', rateLimit: { max: 2, windowSeconds: 60 } },
      schema: { response: { 200: z.object({ ok: z.boolean() }) } },
    },
    () => ({ ok: true }),
  );
  routes.post(
    '/api/test/limited-long',
    {
      config: { access: 'public', rateLimit: { max: 1, windowSeconds: 900 } },
      schema: { response: { 200: z.object({ ok: z.boolean() }) } },
    },
    () => ({ ok: true }),
  );
  return () => app.close();
});

function call(remoteAddress: string, url = '/api/test/limited') {
  return app.inject({ method: 'POST', url, remoteAddress });
}

describe('rate limited routes', () => {
  it('refuse a client past the limit, and say when to come back', async () => {
    expect((await call('203.0.113.1')).statusCode).toBe(200);
    expect((await call('203.0.113.1')).statusCode).toBe(200);
    const refused = await call('203.0.113.1');

    expect(refused.statusCode).toBe(429);
    expect(apiErrorSchema.parse(refused.json()).error.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(refused.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(Number(refused.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('count each client address on its own', async () => {
    expect((await call('203.0.113.2')).statusCode).toBe(200);
  });

  it('start counting again once the window is over', async () => {
    await call('203.0.113.3');
    await call('203.0.113.3');
    expect((await call('203.0.113.3')).statusCode).toBe(429);

    await context.database.db
      .update(schema.rateLimitCounters)
      .set({ expiresAt: sql`now() - interval '1 second'` });

    expect((await call('203.0.113.3')).statusCode).toBe(200);
  });

  it('count an IPv6 network of one subscriber, its /64, as one client', async () => {
    expect((await call('2001:db8::1')).statusCode).toBe(200);
    expect((await call('2001:db8::2')).statusCode).toBe(200);
    expect((await call('2001:db8::ffff:3')).statusCode).toBe(429);
    expect((await call('2001:db8:0:1::1')).statusCode).toBe(200);
  });

  it('keep a long window whatever Better Auth prunes of its own counters', async () => {
    const ip = '203.0.113.4';
    const signIn = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        remoteAddress: ip,
        headers: { origin: 'http://localhost:3000' },
        body: { email: 'nobody@example.com', password: 'not the password' },
      });
    expect((await signIn()).statusCode).toBe(401);
    expect((await call(ip, '/api/test/limited-long')).statusCode).toBe(200);
    expect((await call(ip, '/api/test/limited-long')).statusCode).toBe(429);

    // Better Auth's window is over: its next request prunes every row of its table older than it.
    await context.database.db
      .update(schema.rateLimits)
      .set({ lastRequest: sql`${schema.rateLimits.lastRequest} - 61000` });
    expect((await signIn()).statusCode).toBe(401);

    expect((await call(ip, '/api/test/limited-long')).statusCode).toBe(429);
  });
});

describe('the client a request is counted for', () => {
  it.each([
    ['203.0.113.7', '203.0.113.7'],
    ['::ffff:203.0.113.7', '203.0.113.7'],
    ['2001:db8:a:b:c:d:e:f', '2001:db8:a:b::/64'],
    ['2001:0DB8:000a:0b::1', '2001:db8:a:b::/64'],
    ['2001:db8::', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::192.0.2.1', '64:ff9b:0:0::/64'],
  ])('%s is %s', (ip, client) => {
    expect(clientOf(ip)).toBe(client);
  });
});

describe('pruning the counters', () => {
  it('deletes those whose window is over, and only those', async () => {
    const { db } = context.database;
    await db.delete(schema.rateLimitCounters);
    await db.insert(schema.rateLimitCounters).values([
      { key: 'over', count: 3, expiresAt: sql`now() - interval '1 second'` },
      { key: 'running', count: 3, expiresAt: sql`now() + interval '10 minutes'` },
    ]);

    await db.transaction((tx) =>
      pruneRateLimitsJob.run(
        { tx, log: Fastify({ logger: false }).log, services: testServices() },
        {},
      ),
    );

    const left = await db
      .select({ key: schema.rateLimitCounters.key })
      .from(schema.rateLimitCounters);
    expect(left).toStrictEqual([{ key: 'running' }]);
  });
});
