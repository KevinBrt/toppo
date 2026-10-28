import { schema } from '@toppo-tracker/db';
import { z } from 'zod';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { rebuildProjectWordsJob } from './rebuild-project-words.job.ts';

const { projects } = schema;

const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The words searches are corrected to, made those of the issues as they are: at the first start,
 * then every day, so that a word no issue has any more stops being offered. One job per project,
 * each in a transaction of its own.
 */
export const rebuildIssueWordsJob = defineJob({
  type: 'search.rebuildWords',
  payload: z.object({}),
  every: EVERY_DAY_MS,
  async handler({ tx }) {
    for (const { id } of await tx.select({ id: projects.id }).from(projects)) {
      await enqueue(
        tx,
        rebuildProjectWordsJob,
        { projectId: id },
        { uniqueKey: `search.rebuildProjectWords:${id}` },
      );
    }
  },
});
