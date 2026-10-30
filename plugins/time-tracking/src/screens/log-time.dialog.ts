import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

/**
 * Logs time on any issue, from the report page: the issue picked in Toppo's search (in the
 * project the report shows, if it shows one), then the time and the day. Closes with the minutes
 * logged, for the report to count them.
 */
export const logTimeDialog = plugin.defineDialog({
  name: 'logTime',
  access: 'authenticated',
  title: 'dialogs.logTime.title',
  input: z.object({ projectId: z.uuid().optional() }),
  result: z.object({ minutes: z.int().min(1) }),
  size: 'small',
  component: () => import('../web/log-time-dialog.tsx').then((module) => module.LogTimeDialog),
});
