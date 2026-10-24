import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { rebuildWords } from '../utils/issue-search.util.ts';

const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The words searches are corrected to, made those of the issues as they are: at the first start,
 * then every day, so that a word no issue has any more stops being offered.
 */
export const rebuildIssueWordsJob = defineJob({
  type: 'search.rebuildWords',
  payload: z.object({}),
  every: EVERY_DAY_MS,
  async handler({ tx, log }) {
    const words = await rebuildWords(tx);
    log.info({ words }, 'Search words rebuilt');
  },
});
