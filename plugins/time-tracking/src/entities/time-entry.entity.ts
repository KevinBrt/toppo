import { defineEntity, z } from '@toppo-tracker/plugin-sdk';

/** One entry covers at most a day: more is a typo, or several entries. */
export const MINUTES_PER_DAY = 24 * 60;

/** Time someone spent on an issue, on a given day. */
export const timeEntry = defineEntity({
  attachedTo: 'issue',
  fields: z.object({
    minutes: z.int().min(1).max(MINUTES_PER_DAY),
    /** The day it was spent, as its writer counts days: `2026-10-28`. */
    spentOn: z.iso.date(),
    note: z.string().trim().max(500).optional(),
  }),
  // The weekly summary counts the time of a week by its days.
  indexes: ['spentOn'],
});
