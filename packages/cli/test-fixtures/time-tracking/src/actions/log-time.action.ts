import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

export const logTime = plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId', permission: 'entries.log' },
  input: z.object({ issueId: z.uuid(), minutes: z.int().min(1) }),
  handler: (ctx, input) => Promise.resolve({ minutes: input.minutes, user: ctx.user.id }),
});
