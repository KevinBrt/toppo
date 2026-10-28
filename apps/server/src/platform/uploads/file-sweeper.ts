import { type Db, schema } from '@toppo-tracker/db';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';
import type { Transaction } from '../cqrs/cqrs.ts';
import { defineJob } from '../jobs/jobs.ts';
import type { FileStorage } from './file-storage.ts';

const { attachments } = schema;

const EVERY_HOUR_MS = 60 * 60 * 1000;

/**
 * Removes the files no attachment names any more: those of a deleted attachment, comment, issue
 * or project, of a transaction rolled back, of an upload cut short. The rows say what is kept;
 * the disk follows, so that no command has to reach it after committing.
 */
export async function sweepFiles({
  db,
  files,
}: {
  db: Db | Transaction;
  files: FileStorage;
}): Promise<number> {
  return await files.sweep(async (keys) => {
    const rows = await db
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(inArray(attachments.storageKey, [...keys]));
    return new Set(rows.map(({ storageKey }) => storageKey));
  });
}

/** The sweep, every hour, by whichever server's worker comes first. */
export function fileSweepJob(files: FileStorage) {
  return defineJob({
    type: 'files.sweep',
    payload: z.object({}),
    every: EVERY_HOUR_MS,
    async handler({ tx, log }) {
      const removed = await sweepFiles({ db: tx, files });
      if (removed > 0) {
        log.info({ removed }, 'Swept files no attachment names');
      }
    },
  });
}
