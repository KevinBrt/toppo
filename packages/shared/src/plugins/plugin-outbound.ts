import { z } from 'zod';

/** Hosts inside the network an approval may let a plugin reach, at most. */
export const PLUGIN_PRIVATE_HOSTS_MAX = 10;

/**
 * `chat.internal`, `10.0.0.12`, `fd00::12`: a host inside the network, by its name or address,
 * lowercase, without a port or brackets. Mirrors `plugins_private_hosts_format`.
 */
export const PRIVATE_HOST = /^[a-z0-9]([a-z0-9.:-]{0,251}[a-z0-9])?$/;

export const privateHostSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(PRIVATE_HOST, 'A host is named like chat.internal, without a scheme or a path')
  // One colon is a port, which the host does not carry; an IPv6 address has several.
  .refine((host) => (host.match(/:/g)?.length ?? 0) !== 1, {
    message: 'A host is named without its port',
  });

/** How often a plugin's job runs. Mirrors JOB_EVERY (`@toppo-tracker/plugin-sdk/protocol`). */
export const PLUGIN_JOB_EVERY = ['hour', 'day', 'week'] as const;

/** The calls outside Toppo kept for each plugin, the latest. */
export const PLUGIN_HTTP_CALLS_KEPT = 50;

/** A call a plugin made outside Toppo, as its page shows it: where to and how it went. */
export const pluginHttpCallSchema = z.object({
  id: z.uuid(),
  method: z.string(),
  /** `hooks.slack.com`, with its port unless the scheme's own. */
  host: z.string(),
  /** What the server answered; `null` when it did not. */
  status: z.int().nullable(),
  /** Why it got no answer: `ADDRESS_NOT_ALLOWED`, `TIMEOUT`… Mirrors HTTP_FAILURES. */
  error: z.string().nullable(),
  durationMs: z.int().nonnegative(),
  /** UTC ISO 8601. */
  at: z.iso.datetime(),
});

export type PluginHttpCall = z.infer<typeof pluginHttpCallSchema>;
