import { z } from '@toppo-tracker/plugin-sdk';
import { timeEntry } from '../entities/time-entry.entity.ts';
import { plugin } from '../plugin.ts';

/**
 * Logs time spent on an issue, for whoever asks, in a project where they may log it: kept as an
 * entry written by them, then the issue's time spent counted again from all its entries, so that
 * a total once missed is right again at the next one. Answers the entry.
 */
export const logTime = plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId', permission: 'entries.log' },
  input: timeEntry.fields.extend({ issueId: z.uuid() }),
  async handler(ctx, input) {
    const entry = await ctx.entities.timeEntry.create(input);
    const total = await ctx.entities.timeEntry.sum('minutes', {
      where: { issueId: input.issueId },
    });
    await ctx.issues.setProperty(input.issueId, 'timeSpent', total);
    return entry;
  },
});
