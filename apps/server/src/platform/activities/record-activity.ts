import { schema, uuidv7 } from '@toppo-tracker/db';
import type { IssueActivityPayload, IssueActivityType } from '@toppo-tracker/shared';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Transaction } from '../cqrs/cqrs.ts';

const { activities, jobs, plugins } = schema;

/** Rows written at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

/**
 * The job every recorded activity queues, run by the feature that tells people about it
 * (`features/notifications`): its type and payload, so that neither side guesses the other's.
 */
export const ACTIVITY_RECORDED = {
  type: 'activity.recorded',
  payload: z.object({ activityId: z.uuid() }),
} as const;

/**
 * The job that hands recorded activities to the plugins that hear of them, run by
 * `features/plugins`: every change, people told of it or not, bulk ones in batches.
 */
export const PLUGINS_TOLD = {
  type: 'plugin.eventsRecorded',
  payload: z.object({ activityIds: z.array(z.uuid()).min(1).max(BATCH) }),
} as const;

/** One change to an issue, its payload checked against its type at compile time. */
export interface ActivityRecord<T extends IssueActivityType = IssueActivityType> {
  projectId: string;
  /** `null` once the issue is gone: its deletion. */
  issueId: string | null;
  actorId: string;
  type: T;
  payload: IssueActivityPayload<T>;
}

export interface RecordOptions {
  /**
   * Whether people are told: changes made in bulk by an administrator (a workflow reorganized,
   * a label deleted) are recorded without telling anyone.
   */
  notify?: boolean;
}

/**
 * Records a change to an issue in the transaction that makes it, and queues the job that tells
 * the people concerned, and the one that tells plugins if any hears of it: all commit with the
 * change, or none does. The one way to write an activity (checked by `check:conventions`).
 * Answers its id.
 */
export async function recordActivity<T extends IssueActivityType>(
  tx: Transaction,
  activity: ActivityRecord<T>,
  options: RecordOptions = {},
): Promise<string> {
  const [id] = await recordActivities(tx, [activity], options);
  if (!id) {
    throw new Error('The activity was not recorded');
  }
  return id;
}

/** Records several changes at once (`recordActivity`), in batches. Answers their ids, in order. */
export async function recordActivities(
  tx: Transaction,
  records: readonly ActivityRecord[],
  { notify = true }: RecordOptions = {},
): Promise<string[]> {
  const ids = records.map(() => uuidv7());
  for (let start = 0; start < records.length; start += BATCH) {
    const batch = records.slice(start, start + BATCH);
    await tx.insert(activities).values(
      batch.map((record, index) => ({
        id: ids[start + index] ?? uuidv7(),
        projectId: record.projectId,
        issueId: record.issueId,
        actorId: record.actorId,
        type: record.type,
        payload: record.payload,
      })),
    );
    if (notify) {
      await tx.insert(jobs).values(
        batch.map((_record, index) => ({
          type: ACTIVITY_RECORDED.type,
          payload: ACTIVITY_RECORDED.payload.parse({ activityId: ids[start + index] }),
        })),
      );
    }
    if (await anyPluginHears(tx, [...new Set(batch.map(({ type }) => type))])) {
      await tx.insert(jobs).values({
        type: PLUGINS_TOLD.type,
        payload: PLUGINS_TOLD.payload.parse({ activityIds: ids.slice(start, start + BATCH) }),
      });
    }
  }
  return ids;
}

/** Whether an enabled plugin hears of one of `types`: most changes queue nothing for plugins. */
async function anyPluginHears(tx: Transaction, types: readonly string[]): Promise<boolean> {
  const heard = sql`array[${sql.join(
    types.map((type) => sql`${type}`),
    sql`, `,
  )}]::text[]`;
  const [listening] = await tx
    .select({ id: plugins.id })
    .from(plugins)
    .where(
      and(
        eq(plugins.state, 'enabled'),
        sql`jsonb_exists_any((${plugins.manifest}->'events')::jsonb, ${heard})`,
      ),
    )
    .limit(1);
  return listening !== undefined;
}
