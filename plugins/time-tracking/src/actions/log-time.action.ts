import { z } from '@toppo-tracker/plugin-sdk';
import { timeEntry } from '../entities/time-entry.entity.ts';
import { plugin } from '../plugin.ts';

/**
 * Logs time spent on an issue, for whoever asks, in a project where they may log it: kept as an
 * entry written by them. Answers the entry.
 */
export const logTime = plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId', permission: 'entries.log' },
  input: timeEntry.fields.extend({ issueId: z.uuid() }),
  handler: (ctx, input) => ctx.entities.timeEntry.create(input),
});
