import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';

/**
 * Work done in the background, by any server process: claimed with `FOR UPDATE SKIP LOCKED`,
 * retried later when it fails, kept as `failed` once it failed too often. A job done is deleted;
 * a recurring one waits for its next run instead.
 */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    /** `files.sweep`, `notification.email`…: each type has its payload schema. */
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    /**
     * Higher first, among the jobs due: an email someone waits for (a password reset) never waits
     * behind a flood of notifications.
     */
    priority: integer('priority').notNull().default(0),
    /** When it may run next: later than now while it waits to be retried or claimed. */
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    /** Tries so far, the one under way included. */
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    status: text('status', { enum: ['pending', 'failed'] })
      .notNull()
      .default('pending'),
    /** Why the last try failed, shortened. */
    lastError: text('last_error'),
    /** Two pending jobs never share one: a recurring job, work that must not be queued twice. */
    uniqueKey: text('unique_key'),
    ...timestamps,
  },
  (table) => [
    check('jobs_type_not_blank', sql`btrim(${table.type}) <> ''`),
    check('jobs_status_check', sql`${table.status} in ('pending', 'failed')`),
    check('jobs_attempts_check', sql`${table.attempts} >= 0`),
    check('jobs_max_attempts_check', sql`${table.maxAttempts} >= 1`),
    check('jobs_priority_check', sql`${table.priority} >= 0`),
    // The next job to claim, read from the index alone.
    index('jobs_pending_priority_run_at_idx')
      .on(table.priority.desc(), table.runAt)
      .where(sql`${table.status} = 'pending'`),
    uniqueIndex('jobs_pending_unique_key')
      .on(table.uniqueKey)
      .where(sql`${table.status} = 'pending'`),
  ],
);
