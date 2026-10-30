import { z } from '@toppo-tracker/plugin-sdk';
import { plugin } from '../plugin.ts';

/** Entries a panel shows at once: the latest, the total counting them all. */
const ENTRIES_SHOWN = 100;

/**
 * The time logged on an issue, for whoever sees it: its latest entries, who wrote each, and the
 * total of all of them, in minutes.
 */
export const listEntries = plugin.defineAction({
  name: 'timeEntry.list',
  access: { issue: 'issueId' },
  input: z.object({ issueId: z.uuid() }),
  async handler(ctx, { issueId }) {
    const where = { issueId };
    const [page, total] = await Promise.all([
      ctx.entities.timeEntry.list({ where, pageSize: ENTRIES_SHOWN }),
      ctx.entities.timeEntry.sum('minutes', { where }),
    ]);
    return {
      entries: page.items.map(({ id, minutes, spentOn, note, createdBy }) => ({
        id,
        minutes,
        spentOn,
        note: note ?? null,
        createdBy,
      })),
      count: page.total,
      total,
    };
  },
});
