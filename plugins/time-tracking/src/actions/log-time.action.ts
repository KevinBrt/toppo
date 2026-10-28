import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

/** One entry covers at most a day: more is a typo, or several entries. */
export const MINUTES_PER_DAY = 24 * 60;

/**
 * Logs time spent on an issue, for whoever asks, in a project where they may log it. Checked but
 * not kept yet: entries are kept once plugins have storage of their own.
 */
export const logTime = plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId', permission: 'entries.log' },
  input: z.object({ issueId: z.uuid(), minutes: z.int().min(1).max(MINUTES_PER_DAY) }),
  handler: (ctx, input) =>
    Promise.resolve({ issueId: input.issueId, minutes: input.minutes, userId: ctx.user.id }),
});
