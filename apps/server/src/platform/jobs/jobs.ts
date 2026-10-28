import { type Db, schema } from '@toppo-tracker/db';
import { sql } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';
import type { Services, Transaction } from '../cqrs/cqrs.ts';

const { jobs } = schema;

/** Tries before a job is given up, unless its definition says otherwise. */
const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * What a job runs with: a transaction of its own, which commits only if the job succeeds, its
 * logger, and the app's services. A job may run more than once (a server stopped mid-way): what
 * it does outside the database must bear being done twice.
 */
export interface JobScope {
  tx: Transaction;
  log: FastifyBaseLogger;
  services: Services;
}

/** A job as the worker runs it, whatever its payload. */
export interface RunnableJob {
  /** `resource.action`: `files.sweep`, `notification.email`. */
  readonly type: string;
  readonly maxAttempts: number;
  /** Higher first among the jobs due: 0 by default. */
  readonly priority: number;
  /** How long between two runs of a recurring job, in milliseconds; `null` for a job run once. */
  readonly every: number | null;
  /** Checks the stored payload, then does the work. */
  run(scope: JobScope, payload: unknown): Promise<void>;
}

export interface Job<Payload extends z.ZodObject> extends RunnableJob {
  /** Checked when the job is queued and again when it runs. */
  readonly payload: Payload;
}

interface JobDefinition<Payload extends z.ZodObject> {
  type: string;
  payload: Payload;
  maxAttempts?: number;
  /**
   * Higher first among the jobs due, 0 by default: an email someone waits for, such as a password
   * reset, must not wait behind a flood of notifications.
   */
  priority?: number;
  /** Makes the job recurring: one job of its type, run again this many milliseconds later. */
  every?: number;
  handler(scope: JobScope, payload: z.output<Payload>): Promise<void>;
}

/** Work for the background, queued with `enqueue` and run by the worker of any server process. */
export function defineJob<Payload extends z.ZodObject>(
  definition: JobDefinition<Payload>,
): Job<Payload> {
  return {
    type: definition.type,
    payload: definition.payload,
    maxAttempts: definition.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    priority: definition.priority ?? 0,
    every: definition.every ?? null,
    async run(scope, payload) {
      await definition.handler(scope, definition.payload.parse(payload));
    },
  };
}

export interface EnqueueOptions {
  /** Not before then; as soon as possible otherwise. */
  runAt?: Date;
  /** Queued only if no pending job has this key. */
  uniqueKey?: string;
}

/**
 * Queues a job. Given a command's transaction, the job exists only if the command commits: a
 * side effect never runs for a change that did not happen.
 */
export async function enqueue<Payload extends z.ZodObject>(
  queue: Transaction | Db,
  job: Job<Payload>,
  payload: z.input<Payload>,
  { runAt, uniqueKey }: EnqueueOptions = {},
): Promise<void> {
  await queue
    .insert(jobs)
    .values({
      type: job.type,
      payload: job.payload.parse(payload),
      maxAttempts: job.maxAttempts,
      priority: job.priority,
      uniqueKey: uniqueKey ?? null,
      ...(runAt ? { runAt } : {}),
    })
    .onConflictDoNothing({ target: jobs.uniqueKey, where: sql`${jobs.status} = 'pending'` });
}

/**
 * Queues each recurring job once, under its type as key: servers starting together, or again,
 * never queue it twice.
 */
export async function scheduleRecurringJobs(db: Db, all: readonly RunnableJob[]): Promise<void> {
  for (const job of all.filter(({ every }) => every !== null)) {
    await db
      .insert(jobs)
      .values({
        type: job.type,
        maxAttempts: job.maxAttempts,
        priority: job.priority,
        uniqueKey: job.type,
      })
      .onConflictDoNothing({ target: jobs.uniqueKey, where: sql`${jobs.status} = 'pending'` });
  }
}
