import { randomInt } from 'node:crypto';
import { retryDelay } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import { eq, sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { Services, Transaction } from '../cqrs/cqrs.ts';
import type { RunnableJob } from './jobs.ts';

const { jobs } = schema;

/**
 * How long a claimed job is kept from other workers should its own die without a word: far
 * longer than any job takes. A live worker holds it locked anyway.
 */
const LEASE_SECONDS = 15 * 60;
/** Waits between two looks at an empty queue. */
const IDLE_MS = 2000;
const ERROR_MAX_LENGTH = 1000;

export interface WorkerContext {
  db: Db;
  jobs: readonly RunnableJob[];
  log: FastifyBaseLogger;
  services: Services;
}

type StoredJob = typeof jobs.$inferSelect;

/**
 * Claims the next job due, the most urgent first, then the oldest, runs it, and records how it went; answers whether there was one.
 * Claiming counts the try and moves the job out of reach for a while, then commits: a job that
 * stops its server mid-way counts its tries too, and is given up like any other.
 */
export async function runNextJob(context: WorkerContext): Promise<boolean> {
  const [claimed] = await context.db
    .update(jobs)
    .set({
      attempts: sql`${jobs.attempts} + 1`,
      runAt: sql`now() + make_interval(secs => ${LEASE_SECONDS})`,
    })
    .where(
      eq(
        jobs.id,
        sql`(select ${jobs.id} from ${jobs}
          where ${jobs.status} = 'pending' and ${jobs.runAt} <= now()
          order by ${jobs.priority} desc, ${jobs.runAt} limit 1 for update skip locked)`,
      ),
    )
    .returning({ id: jobs.id });
  if (!claimed) {
    return false;
  }
  await context.db.transaction(async (tx) => {
    // Held until the job is done: no other worker takes it, even once its lease is over.
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, claimed.id)).for('update');
    if (job) {
      await runLocked(tx, job, context);
    }
  });
  return true;
}

async function runLocked(tx: Transaction, job: StoredJob, context: WorkerContext): Promise<void> {
  const log = context.log.child({ job: job.type, jobId: job.id, attempt: job.attempts });
  const definition = context.jobs.find(({ type }) => type === job.type);
  if (!definition) {
    log.error('No worker knows this type of job');
    await tx
      .update(jobs)
      .set({ status: 'failed', lastError: 'Unknown type of job' })
      .where(eq(jobs.id, job.id));
    return;
  }
  if (job.attempts > job.maxAttempts) {
    await failed(tx, job, definition, new Error('Interrupted too many times'), log);
    return;
  }
  try {
    // A savepoint: the job's own writes go if it fails, and its failure is still recorded here.
    await tx.transaction((savepoint) =>
      definition.run({ tx: savepoint, log, services: context.services }, job.payload),
    );
  } catch (error) {
    await failed(tx, job, definition, error, log);
    return;
  }
  if (definition.every === null) {
    await tx.delete(jobs).where(eq(jobs.id, job.id));
  } else {
    await nextRun(tx, job.id, definition.every, null);
  }
}

/**
 * Records a failure: tried again later, with a longer wait each time, until it has failed too
 * often. A job run once is then kept as `failed`; a recurring one waits for its next run.
 */
async function failed(
  tx: Transaction,
  job: StoredJob,
  definition: RunnableJob,
  error: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  const reason = (error instanceof Error ? error.message : 'The job failed').slice(
    0,
    ERROR_MAX_LENGTH,
  );
  if (job.attempts < job.maxAttempts) {
    log.warn({ err: error }, 'Job failed, to be tried again');
    const delay = retryDelay(job.attempts, randomInt(1_000_001) / 1_000_000);
    await tx
      .update(jobs)
      .set({ lastError: reason, runAt: sql`now() + make_interval(secs => ${delay / 1000})` })
      .where(eq(jobs.id, job.id));
    return;
  }
  log.error({ err: error }, 'Job failed too many times');
  if (definition.every === null) {
    await tx.update(jobs).set({ status: 'failed', lastError: reason }).where(eq(jobs.id, job.id));
  } else {
    await nextRun(tx, job.id, definition.every, reason);
  }
}

/** A recurring job waits for its next run, its tries counted again from zero. */
async function nextRun(
  tx: Transaction,
  jobId: string,
  every: number,
  lastError: string | null,
): Promise<void> {
  await tx
    .update(jobs)
    .set({ attempts: 0, lastError, runAt: sql`now() + make_interval(secs => ${every / 1000})` })
    .where(eq(jobs.id, jobId));
}

/**
 * Runs jobs one after the other, as long as some are due, then looks again every 2 seconds;
 * `stop` lets the job under way end. A failure of the queue itself is logged and tried later.
 */
export function startJobWorker(context: WorkerContext): { stop: () => Promise<void> } {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const tick = async () => {
    let ran = false;
    try {
      ran = await runNextJob(context);
    } catch (error) {
      context.log.error({ err: error }, 'The job queue could not be read');
    }
    if (!stopped) {
      timer = setTimeout(
        () => {
          running = tick();
        },
        ran ? 0 : IDLE_MS,
      );
    }
  };
  running = tick();

  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}
