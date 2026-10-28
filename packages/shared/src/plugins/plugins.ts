import { z } from 'zod';
import { userRefSchema } from '../members/users.ts';
import { projectKeySchema } from '../project-key.ts';

/**
 * `pending` until an administrator approves what it declares, and again when an upgrade asks for
 * more; then `enabled`, or `disabled` by an administrator.
 */
export const PLUGIN_STATES = ['pending', 'enabled', 'disabled'] as const;

export type PluginState = (typeof PLUGIN_STATES)[number];

/** At most this many plugins in an instance: each runs in a worker of its own. */
export const PLUGINS_MAX = 50;

/** At most this many projects named in an approval: beyond, a plugin acts in all of them. */
export const PLUGIN_PROJECTS_MAX = 100;

/** `time-tracking`. Mirrors PLUGIN_ID (`@toppo-tracker/plugin-sdk/protocol`). */
export const pluginSlugSchema = z.string().regex(/^[a-z][a-z0-9-]{1,38}[a-z0-9]$/);

export const pluginSlugParamsSchema = z.object({
  pluginSlug: pluginSlugSchema,
});

/** A plugin as the list of installed ones shows it. */
export const pluginSummarySchema = z.object({
  slug: z.string(),
  version: z.string(),
  state: z.enum(PLUGIN_STATES),
  /** UTC ISO 8601 date it was uploaded first. */
  createdAt: z.iso.datetime(),
  /** UTC ISO 8601 date of its last upload, approval or change of state. */
  updatedAt: z.iso.datetime(),
});

export type PluginSummary = z.infer<typeof pluginSummarySchema>;

/** Body of `GET /api/v1/plugins`: every plugin installed, by slug. */
export const pluginsResponseSchema = z.object({
  plugins: z.array(pluginSummarySchema),
});

export type PluginsResponse = z.infer<typeof pluginsResponseSchema>;

/**
 * Body of `POST /api/v1/plugins`: the plugin the zip installed or upgraded. An upgrade asking for
 * more than was approved waits for a new approval, `pending`.
 */
export const installPluginResponseSchema = z.object({
  slug: z.string(),
});

export type InstallPluginResponse = z.infer<typeof installPluginResponseSchema>;

/** Body of `GET /api/v1/plugins/:pluginSlug`: what its code declares, to approve it. */
export const pluginDetailsResponseSchema = pluginSummarySchema.extend({
  /** SHA-256 of the zip uploaded, hex-encoded, for the administrator to compare. */
  packageSha256: z.string(),
  /** The plugin API it was written for: `^1.0`. */
  apiVersion: z.string(),
  /** What it reads and writes through Toppo: `issue.read`, `comment.create`… */
  needs: z.array(z.string()),
  /** The permissions it adds, by their short name: `reports.read`. */
  permissions: z.array(
    z.object({
      name: z.string(),
      scope: z.enum(['instance', 'project']),
      label: z.string(),
    }),
  ),
  /** The events it hears of. */
  events: z.array(z.string()),
  /** What people may ask it to do. */
  actions: z.array(z.string()),
  /** It acts in every project, present and future; otherwise in `projects` only. */
  allProjects: z.boolean(),
  projects: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string() })),
  /** Who approved what it declares, and when: `null` while it waits for an approval. */
  approval: z.object({ by: userRefSchema.nullable(), at: z.iso.datetime() }).nullable(),
});

export type PluginDetailsResponse = z.infer<typeof pluginDetailsResponseSchema>;

/** Body of `POST /api/v1/plugins/:pluginSlug/approve`: where it may act. */
export const approvePluginRequestSchema = z.object({
  /** Every project, present and future, or these ones. */
  projects: z.union([z.literal('all'), z.array(projectKeySchema).max(PLUGIN_PROJECTS_MAX)]),
});

export type ApprovePluginRequest = z.infer<typeof approvePluginRequestSchema>;
