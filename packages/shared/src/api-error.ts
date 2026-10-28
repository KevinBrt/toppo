import { z } from 'zod';

/** The single error envelope returned by every API endpoint. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
    /**
     * Why a plugin refused (`PLUGIN_REFUSED`), in its own words: one of its message keys, and the
     * values its message takes. Its screens translate it with its messages.
     */
    plugin: z
      .object({
        code: z.string(),
        params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
      })
      .optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
