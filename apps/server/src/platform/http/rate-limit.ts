import { isIP } from 'node:net';
import { type Db, schema } from '@toppo-tracker/db';
import { lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { defineJob } from '../jobs/jobs.ts';
import { HttpError } from './http-error.ts';

const { rateLimitCounters } = schema;

const EVERY_HOUR_MS = 60 * 60 * 1000;

/** At most `max` requests per client in each window of `windowSeconds`. */
export interface RateLimit {
  max: number;
  windowSeconds: number;
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Required on public routes that write: they are open to anyone (checked by tests). */
    rateLimit?: RateLimit;
  }
}

/**
 * Counts requests per route and client in PostgreSQL, so every server process shares the counts,
 * with one atomic upsert per request. Runs before the body is parsed. The windows are PostgreSQL's
 * clock, whatever the server's says.
 */
export function registerRateLimit(app: FastifyInstance, { db }: { db: Db }): void {
  app.addHook('onRequest', async (request, reply) => {
    const limit = request.routeOptions.config.rateLimit;
    if (!limit) {
      return;
    }
    const expired = sql`${rateLimitCounters.expiresAt} <= now()`;
    const windowEnd = sql`now() + make_interval(secs => ${limit.windowSeconds})`;
    const [counter] = await db
      .insert(rateLimitCounters)
      .values({
        key: `${request.method} ${request.routeOptions.url}:${clientOf(request.ip)}`,
        count: 1,
        expiresAt: windowEnd,
      })
      .onConflictDoUpdate({
        target: rateLimitCounters.key,
        set: {
          count: sql`case when ${expired} then 1 else ${rateLimitCounters.count} + 1 end`,
          expiresAt: sql`case when ${expired} then ${windowEnd} else ${rateLimitCounters.expiresAt} end`,
        },
      })
      .returning({
        count: rateLimitCounters.count,
        secondsLeft: sql<number>`ceil(extract(epoch from ${rateLimitCounters.expiresAt} - now()))::int`,
      });
    if (counter && counter.count > limit.max) {
      reply.header('retry-after', String(Math.max(counter.secondsLeft, 1)));
      throw new HttpError(429, 'TOO_MANY_REQUESTS', 'Too many requests, try again later');
    }
  });
}

/**
 * Who a request comes from, as counted: an IPv6 address by its /64, which one subscriber holds
 * whole and could otherwise walk through for a fresh count each time; an IPv4 one as it is.
 */
export function clientOf(ip: string): string {
  if (isIP(ip) !== 6) {
    return ip;
  }
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) {
    return mapped[1];
  }
  const [head = '', tail] = (ip.split('%')[0] ?? ip).split('::');
  const left = head === '' ? [] : head.split(':');
  const right = tail === undefined || tail === '' ? [] : tail.split(':');
  // A trailing dotted quad (`64:ff9b::192.0.2.1`) stands for two groups.
  const groupsOfRight = right.length + (right.at(-1)?.includes('.') ? 1 : 0);
  const groups = [...left, ...Array<string>(8 - left.length - groupsOfRight).fill('0'), ...right];
  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(':')}::/64`;
}

/** Deletes the counters whose window is over: the next request starts one anew anyway. */
export const pruneRateLimitsJob = defineJob({
  type: 'rateLimits.prune',
  payload: z.object({}),
  every: EVERY_HOUR_MS,
  async handler({ tx }) {
    await tx.delete(rateLimitCounters).where(lt(rateLimitCounters.expiresAt, sql`now()`));
  },
});
