import { schema } from '@toppo/db';
import { lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';

const { notifications } = schema;

const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/** Notifications read 90 days ago leave, every day; unread ones stay until read. */
export const pruneNotificationsJob = defineJob({
  type: 'notifications.prune',
  payload: z.object({}),
  every: EVERY_DAY_MS,
  async handler({ tx, log }) {
    const pruned = await tx
      .delete(notifications)
      .where(lt(notifications.readAt, sql`now() - interval '90 days'`))
      .returning({ id: notifications.id });
    if (pruned.length > 0) {
      log.info({ pruned: pruned.length }, 'Old notifications pruned');
    }
  },
});
