import { schema } from '@toppo-tracker/db';
import { z } from 'zod';
import { defineJob } from '../../jobs/jobs.ts';
import type { PackageStore } from './package-store.ts';

const { plugins } = schema;

const EVERY_HOUR_MS = 60 * 60 * 1000;

/**
 * Removes the packages no plugin names any more, every hour, by whichever server's worker comes
 * first. The rows say what is kept; the disk follows, so that no command reaches it after
 * committing.
 */
export function packageSweepJob(packages: PackageStore) {
  return defineJob({
    type: 'plugins.packages.sweep',
    payload: z.object({}),
    every: EVERY_HOUR_MS,
    async handler({ tx, log }) {
      const kept = await tx
        .select({ slug: plugins.slug, sha256: plugins.packageSha256 })
        .from(plugins);
      const removed = await packages.sweep(kept);
      if (removed > 0) {
        log.info({ removed }, 'Swept plugin packages no plugin names');
      }
    },
  });
}
