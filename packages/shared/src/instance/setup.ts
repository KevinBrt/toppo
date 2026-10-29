import { z } from 'zod';
import { displayNameSchema, passwordSchema, personEmailSchema } from '../auth.ts';
import { DEFAULT_LOCALE, localeSchema } from '../locale.ts';

/** Body of `GET /api/v1/setup`: whether the first-run wizard still has to run. */
export const setupStatusResponseSchema = z.object({
  required: z.boolean(),
});

export type SetupStatusResponse = z.infer<typeof setupStatusResponseSchema>;

/** Body of `POST /api/v1/setup`: the code printed in the server logs and the first admin. */
export const setupRequestSchema = z.object({
  setupCode: z.string().trim().min(1).max(64),
  admin: z.object({
    name: displayNameSchema,
    email: personEmailSchema,
    password: passwordSchema,
  }),
  /** Language of the administrator: default data (role names) is written in it. */
  locale: localeSchema.default(DEFAULT_LOCALE),
});

/** What the client sends; `locale` may be omitted. */
export type SetupRequest = z.input<typeof setupRequestSchema>;

export const setupResponseSchema = z.object({
  userId: z.uuid(),
});

export type SetupResponse = z.infer<typeof setupResponseSchema>;
