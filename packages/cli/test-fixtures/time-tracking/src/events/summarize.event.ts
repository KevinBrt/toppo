import { plugin } from '../plugin.ts';

export const summarize = plugin.defineEventHandler({
  event: 'issue.statusChanged',
  async handler(ctx, { event, issue }) {
    if (issue.closedAt !== null) {
      await ctx.issues.comment(issue.id, ctx.t('closed'), { once: event.id });
    }
  },
});
