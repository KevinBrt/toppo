import { schema } from '@toppo-tracker/db';
import { lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';

const { pluginOnceKeys } = schema;

const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Removes the keys of plugins' single writes once a week old: far past the last try of the job
 * that wrote them, nothing writes again under them.
 */
export const sweepOnceKeysJob = defineJob({
  type: 'plugin.onceKeys.sweep',
  payload: z.object({}),
  every: EVERY_DAY_MS,
  async handler({ tx, log }) {
    const removed = await tx
      .delete(pluginOnceKeys)
      .where(lt(pluginOnceKeys.createdAt, sql`now() - interval '7 days'`))
      .returning({ id: pluginOnceKeys.id });
    if (removed.length > 0) {
      log.info({ removed: removed.length }, 'Swept the keys of plugins’ single writes');
    }
  },
});
