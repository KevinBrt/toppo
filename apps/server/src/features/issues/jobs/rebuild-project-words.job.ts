import { z } from 'zod';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { rebuildProjectWords } from '../utils/issue-search.util.ts';

/** The words searches in one project are corrected to, made those of its issues as they are. */
export const rebuildProjectWordsJob = defineJob({
  type: 'search.rebuildProjectWords',
  payload: z.object({ projectId: z.uuid() }),
  async handler({ tx, log }, { projectId }) {
    const words = await rebuildProjectWords(tx, projectId);
    log.info({ projectId, words }, 'Search words of a project rebuilt');
  },
});
