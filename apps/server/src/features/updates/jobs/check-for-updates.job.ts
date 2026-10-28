import { schema } from '@toppo-tracker/db';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import type { PublishedRelease } from '../../../platform/updates/release-feed.ts';

const { instanceSettings } = schema;

const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Asks, once a day and at each start, for the latest version of Toppo published, and keeps it
 * for those who manage the instance. Turned off (`TOPPO_UPDATE_CHECK`), it forgets what it knew.
 * Unanswered, it keeps what it knew and asks again the next day: an instance cut from the
 * internet is not broken.
 */
export const checkForUpdatesJob = defineJob({
  type: 'updates.check',
  payload: z.object({}),
  every: EVERY_DAY_MS,
  async handler({ tx, services, log }) {
    if (!services.releases.enabled) {
      await tx
        .update(instanceSettings)
        .set({ latestVersion: null, latestVersionUrl: null, latestVersionCheckedAt: null });
      return;
    }
    let latest: PublishedRelease | null;
    try {
      latest = await services.releases.latest();
    } catch (error) {
      log.warn(
        { err: error },
        'Could not learn the latest version of Toppo; asking again tomorrow',
      );
      return;
    }
    await tx.update(instanceSettings).set({
      latestVersion: latest?.version ?? null,
      latestVersionUrl: latest?.url ?? null,
      latestVersionCheckedAt: sql`now()`,
    });
    log.info({ latest: latest?.version ?? null }, 'Latest version of Toppo checked');
  },
});
