import { schema, uuidv7 } from '@toppo-tracker/db';
import type { IssueActivityPayload, IssueActivityType } from '@toppo-tracker/shared';
import { z } from 'zod';
import type { Transaction } from '../cqrs/cqrs.ts';

const { activities, jobs } = schema;

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
 * the people concerned: both commit with the change, or neither does. The one way to write an
 * activity (checked by `check:conventions`). Answers its id.
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
  }
  return ids;
}
