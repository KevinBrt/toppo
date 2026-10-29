import { z } from 'zod';

export const LOCALES = ['en', 'fr'] as const;

export type Locale = (typeof LOCALES)[number];

/** What Toppo tells a plugin with each run, beside its payload. */
export const runContextSchema = z.object({
  locale: z.enum(LOCALES),
  /** Who an action runs for; none for an event, a job or a route: the plugin runs as itself. */
  user: z.object({ id: z.uuid() }).nullable(),
  /** As the administrator saved them: the plugin parses them with its own schema. */
  settings: z.unknown(),
});

export type RunContext = z.infer<typeof runContextSchema>;

/** The words of a message that vary: `{limit}` in "At most {limit} minutes a day". */
export const messageParamsSchema = z.record(z.string(), z.union([z.string(), z.number()]));

/** How a run went, as a plugin answers it. */
export const runAnswerSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      /** One of the plugin's message keys, for the person who acted; or a code of the SDK. */
      code: z.string().min(1).max(200),
      params: messageParamsSchema.optional(),
      /** What did not fit its input, field by field. */
      issues: z
        .array(z.object({ path: z.string().max(200), message: z.string().max(500) }))
        .max(50)
        .optional(),
    }),
    /** For Toppo's log only. */
    detail: z.string().max(500).optional(),
  }),
]);

export type RunAnswer = z.infer<typeof runAnswerSchema>;

/** The codes the SDK answers itself, beside the plugin's own. */
export const RUN_FAILURES = [
  'VALIDATION_FAILED',
  'INVALID_SETTINGS',
  'UNKNOWN_ACTION',
  'UNKNOWN_EVENT',
  'UNKNOWN_JOB',
  'UNKNOWN_ROUTE',
  'PLUGIN_ERROR',
] as const;
