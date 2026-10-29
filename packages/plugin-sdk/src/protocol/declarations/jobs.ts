import { z } from 'zod';

/** How often a plugin's job runs: counted from its last run, since Toppo keeps no time zone. */
export const JOB_EVERY = ['hour', 'day', 'week'] as const;

export type JobEvery = (typeof JOB_EVERY)[number];

export const JOB_EVERY_MS: Readonly<Record<JobEvery, number>> = {
  hour: 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
};

/** At most this many jobs in a plugin. */
export const JOBS_MAX = 5;

/** `weeklySummary`: a job's name. */
export const JOB_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;

/** Work a plugin does on its own, as itself, again and again: shown to who approves it. */
export const jobSchema = z.strictObject({
  name: z.string().regex(JOB_NAME, 'A job is named like weeklySummary'),
  every: z.enum(JOB_EVERY),
  /** What it does, a key of its messages. */
  label: z.string().max(200),
});

export type JobDeclaration = z.infer<typeof jobSchema>;

export const jobsSchema = z
  .array(jobSchema)
  .max(JOBS_MAX)
  .refine((jobs) => new Set(jobs.map(({ name }) => name)).size === jobs.length, {
    message: 'Two jobs share a name',
  });
