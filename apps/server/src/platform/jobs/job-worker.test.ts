import { schema } from '@toppo-tracker/db';
import { eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { setupTestDatabase, testServices } from '../../test-helpers.ts';
import { runNextJob, startJobWorker, startJobWorkers, type WorkerContext } from './job-worker.ts';
import { defineJob, enqueue, type RunnableJob, scheduleRecurringJobs } from './jobs.ts';

const { jobs } = schema;
const context = setupTestDatabase();
const log = Fastify({ logger: false }).log;

/** What the jobs of these tests did, in order. */
let done: string[] = [];

const greet = defineJob({
  type: 'test.greet',
  payload: z.object({ name: z.string() }),
  handler(_scope, { name }) {
    done.push(`hello ${name}`);
    return Promise.resolve();
  },
});

/** Queues a greeting, then fails: what it queued goes with it. */
const flaky = defineJob({
  type: 'test.flaky',
  payload: z.object({}),
  maxAttempts: 2,
  async handler({ tx }) {
    await enqueue(tx, greet, { name: 'from a failed job' });
    done.push('flaky');
    throw new Error('SMTP server unreachable');
  },
});

const hourly = defineJob({
  type: 'test.hourly',
  payload: z.object({}),
  every: 60 * 60 * 1000,
  handler() {
    done.push('hourly');
    return Promise.resolve();
  },
});

/** Someone waits for it: it goes before the greetings due. */
const urgent = defineJob({
  type: 'test.urgent',
  payload: z.object({ name: z.string() }),
  priority: 2,
  handler(_scope, { name }) {
    done.push(`urgent ${name}`);
    return Promise.resolve();
  },
});

/** Runs again as long as its payload says, each at its own pace. */
const paced = defineJob({
  type: 'test.paced',
  payload: z.object({ name: z.string(), againInMs: z.int().nullable() }),
  handler(_scope, { name, againInMs }) {
    done.push(`paced ${name}`);
    return Promise.resolve(againInMs === null ? undefined : { runAgainInMs: againInMs });
  },
});

/** Lets the calls waiting on a service outside Toppo answer. */
let answer: () => void = () => undefined;

/** Waits on a service outside Toppo until the test lets it answer. */
const call = defineJob({
  type: 'test.call',
  payload: z.object({ name: z.string() }),
  waitsOutside: true,
  async handler(_scope, { name }) {
    await new Promise<void>((answered) => {
      const before = answer;
      answer = () => {
        before();
        answered();
      };
    });
    done.push(`called ${name}`);
  },
});

function worker(
  all: readonly RunnableJob[] = [greet, flaky, hourly, urgent, paced, call],
): WorkerContext {
  return { db: context.database.db, jobs: all, log, services: testServices() };
}

async function stored() {
  return await context.database.db
    .select({
      type: jobs.type,
      status: jobs.status,
      attempts: jobs.attempts,
      lastError: jobs.lastError,
      waits: sql<boolean>`${jobs.runAt} > now()`,
    })
    .from(jobs)
    .orderBy(jobs.createdAt);
}

/** Makes every waiting job due now, as if the time had passed. */
async function timePasses(): Promise<void> {
  await context.database.db.update(jobs).set({ runAt: sql`now()` });
}

beforeEach(async () => {
  done = [];
  await context.database.db.delete(jobs);
});

describe('running jobs', () => {
  it('runs a job queued by a transaction that committed, never one rolled back', async () => {
    await context.database.db.transaction((tx) => enqueue(tx, greet, { name: 'Ada' }));
    await context.database.db
      .transaction(async (tx) => {
        await enqueue(tx, greet, { name: 'never' });
        throw new Error('The command failed');
      })
      .catch(() => undefined);

    expect(await runNextJob(worker())).toBe(true);
    expect(await runNextJob(worker())).toBe(false);
    expect(done).toStrictEqual(['hello Ada']);
    expect(await stored()).toStrictEqual([]);
  });

  it('runs the jobs due, the oldest first, and leaves the others waiting', async () => {
    const { db } = context.database;
    // Minutes apart: the database's clock may differ from the server's by a second or so.
    await enqueue(db, greet, { name: 'later' }, { runAt: new Date(Date.now() + 10 * 60_000) });
    await enqueue(db, greet, { name: 'first' }, { runAt: new Date(Date.now() - 10 * 60_000) });
    await enqueue(db, greet, { name: 'second' }, { runAt: new Date(Date.now() - 5 * 60_000) });

    while (await runNextJob(worker())) {
      // Until none is due.
    }

    expect(done).toStrictEqual(['hello first', 'hello second']);
    expect(await stored()).toMatchObject([{ type: 'test.greet', waits: true, attempts: 0 }]);
  });

  it('runs the most urgent of the jobs due first, then the oldest', async () => {
    const { db } = context.database;
    for (const name of ['one', 'two', 'three']) {
      await enqueue(db, greet, { name }, { runAt: new Date(Date.now() - 60_000) });
    }
    await enqueue(db, urgent, { name: 'reset' });

    while (await runNextJob(worker())) {
      // Until none is due.
    }

    expect(done).toStrictEqual(['urgent reset', 'hello one', 'hello two', 'hello three']);
  });

  it('refuses a payload its job does not expect, before it is queued', async () => {
    await expect(
      enqueue(context.database.db, greet, { name: 42 } as unknown as { name: string }),
    ).rejects.toThrow();
    expect(await stored()).toStrictEqual([]);
  });

  it('queues a job only once under a key while it waits', async () => {
    const { db } = context.database;
    await enqueue(db, greet, { name: 'Ada' }, { uniqueKey: 'greet:ada' });
    await enqueue(db, greet, { name: 'Ada' }, { uniqueKey: 'greet:ada' });

    expect(await stored()).toHaveLength(1);
  });
});

describe('a job that fails', () => {
  it('undoes its writes, waits longer each time, then is kept as failed', async () => {
    await enqueue(context.database.db, flaky, {});

    expect(await runNextJob(worker())).toBe(true);
    expect(await stored()).toStrictEqual([
      {
        type: 'test.flaky',
        status: 'pending',
        attempts: 1,
        lastError: 'SMTP server unreachable',
        waits: true,
      },
    ]);
    // Not due before its wait is over.
    expect(await runNextJob(worker())).toBe(false);
    await timePasses();
    expect(await runNextJob(worker())).toBe(true);

    expect(done).toStrictEqual(['flaky', 'flaky']);
    expect(await stored()).toMatchObject([
      { type: 'test.flaky', status: 'failed', attempts: 2, lastError: 'SMTP server unreachable' },
    ]);
    expect(await runNextJob(worker())).toBe(false);
  });

  it('is given up once it stopped its server too many times, without running again', async () => {
    const { db } = context.database;
    await enqueue(db, greet, { name: 'Ada' });
    // Claimed five times by servers that stopped before it was done.
    await db.update(jobs).set({ attempts: 5 });

    expect(await runNextJob(worker())).toBe(true);
    expect(done).toStrictEqual([]);
    expect(await stored()).toMatchObject([
      { status: 'failed', attempts: 6, lastError: 'Interrupted too many times' },
    ]);
  });

  it('is kept as failed when no worker knows its type', async () => {
    await context.database.db.insert(jobs).values({ type: 'test.gone' });

    expect(await runNextJob(worker())).toBe(true);
    expect(await stored()).toMatchObject([{ status: 'failed', lastError: 'Unknown type of job' }]);
  });
});

describe('two workers', () => {
  it('never run the same job, the second leaving it to the first', async () => {
    let release: (() => void) | undefined;
    const slow = defineJob({
      type: 'test.slow',
      payload: z.object({}),
      async handler() {
        done.push('slow');
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    await enqueue(context.database.db, slow, {});

    const first = runNextJob(worker([slow]));
    await vi.waitFor(() => expect(done).toStrictEqual(['slow']));
    expect(await runNextJob(worker([slow]))).toBe(false);
    release?.();
    await first;

    expect(done).toStrictEqual(['slow']);
    expect(await stored()).toStrictEqual([]);
  });
});

describe('a recurring job', () => {
  it('is queued once however many servers start, then waits for its next run', async () => {
    const { db } = context.database;
    await Promise.all([scheduleRecurringJobs(db, [hourly]), scheduleRecurringJobs(db, [hourly])]);
    expect(await stored()).toHaveLength(1);

    expect(await runNextJob(worker())).toBe(true);

    expect(done).toStrictEqual(['hourly']);
    expect(await stored()).toStrictEqual([
      { type: 'test.hourly', status: 'pending', attempts: 0, lastError: null, waits: true },
    ]);
    const [next] = await db
      .select({ inMinutes: sql<number>`extract(epoch from ${jobs.runAt} - now()) / 60` })
      .from(jobs)
      .where(eq(jobs.type, 'test.hourly'));
    expect(Number(next?.inMinutes)).toBeGreaterThan(59);
  });
});

describe('a job queued once that asks to run again', () => {
  it('waits for its next run, each at its own pace, until it asks no more', async () => {
    const { db } = context.database;
    await enqueue(db, paced, { name: 'daily', againInMs: 24 * 60 * 60 * 1000 });
    await enqueue(db, paced, { name: 'done', againInMs: null });

    expect(await runNextJob(worker())).toBe(true);
    expect(await runNextJob(worker())).toBe(true);

    expect(done).toStrictEqual(['paced daily', 'paced done']);
    const [next] = await db
      .select({
        payload: jobs.payload,
        inHours: sql<number>`extract(epoch from ${jobs.runAt} - now()) / 3600`,
      })
      .from(jobs);
    expect(next?.payload).toStrictEqual({ name: 'daily', againInMs: 24 * 60 * 60 * 1000 });
    expect(Number(next?.inHours)).toBeGreaterThan(23.9);
    expect(await stored()).toHaveLength(1);
  });
});

describe('startJobWorker', () => {
  it('runs what is queued, then stops once the job under way is done', async () => {
    const running = startJobWorker(worker());
    await enqueue(context.database.db, greet, { name: 'Grace' });

    await vi.waitFor(() => expect(done).toStrictEqual(['hello Grace']), { timeout: 5000 });
    await running.stop();
    await enqueue(context.database.db, greet, { name: 'nobody' });

    expect(await stored()).toMatchObject([{ type: 'test.greet', status: 'pending' }]);
  });
});

describe('startJobWorkers', () => {
  it('runs the jobs waiting on a service outside Toppo apart: a slow one holds up no other', async () => {
    const running = startJobWorkers(worker());
    try {
      await enqueue(context.database.db, call, { name: 'a slow receiver' });
      await enqueue(context.database.db, call, { name: 'another' });
      await enqueue(context.database.db, greet, { name: 'Grace' });

      await vi.waitFor(() => expect(done).toStrictEqual(['hello Grace']), { timeout: 5000 });
      answer();
      await vi.waitFor(() => expect(done).toHaveLength(3), { timeout: 5000 });
      expect(done).toContain('called a slow receiver');
    } finally {
      answer();
      await running.stop();
    }
  });
});
