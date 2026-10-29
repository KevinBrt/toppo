import { z } from 'zod';
import { userRefSchema } from '../members/users.ts';
import { projectKeySchema } from '../project-key.ts';
import { PROPERTY_DISPLAYS, PROPERTY_TYPES, PROPERTY_WRITERS } from '../properties/properties.ts';

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

/**
 * Query of `DELETE /api/v1/plugins/:pluginSlug`: what becomes of what the plugin kept. Kept, it is
 * found again if the plugin comes back.
 */
export const uninstallPluginQuerySchema = z.object({
  data: z.enum(['keep', 'delete']).default('keep'),
});

export type UninstallPluginQuery = z.infer<typeof uninstallPluginQuerySchema>;

/** Words in each language Toppo speaks: a plugin's, from its own messages. */
const translatedSchema = z.object({ en: z.string(), fr: z.string() });

/**
 * How a plugin's run went wrong, in Toppo's words: the sandbox's own failures, and a handler that
 * answered an error. Never in the plugin's words, which stay in the server's log.
 */
export const PLUGIN_FAILURES = [
  'LOAD_FAILED',
  'TIMEOUT',
  'OUT_OF_MEMORY',
  'PLUGIN_ERROR',
  'INVALID_ANSWER',
  'CRASHED',
  'ANSWERED_ERROR',
] as const;

export type PluginFailure = (typeof PLUGIN_FAILURES)[number];

/** Runs that fail in a row before Toppo disables their plugin. */
export const FAILURES_BEFORE_DISABLING = 10;

/** `hoursPerDay`. Mirrors SETTING_NAME (`@toppo-tracker/plugin-sdk/protocol`). */
const settingNameSchema = z.string().regex(/^[a-z][A-Za-z0-9]{0,39}$/);

/** At most this many settings in a plugin. Mirrors PLUGIN_SETTINGS_MAX (`…/protocol`). */
const SETTINGS_MAX = 30;

/** What a plugin's settings may weigh, as JSON: a form's worth, not files. */
export const PLUGIN_SETTINGS_MAX_BYTES = 16 * 1024;

/** The longest text a setting holds. */
export const PLUGIN_SETTING_TEXT_MAX_LENGTH = 1000;

/** A setting's value, as its form gives it. */
export const pluginSettingValueSchema = z.union([
  z.string().max(PLUGIN_SETTING_TEXT_MAX_LENGTH),
  z.number(),
  z.boolean(),
]);

export type PluginSettingValue = z.infer<typeof pluginSettingValueSchema>;

const settingWords = {
  name: z.string(),
  /** What the form calls it, in each language, from the plugin's messages. */
  label: translatedSchema,
  help: translatedSchema.nullable(),
};

/**
 * One of a plugin's settings, as its form draws it: a text (an address, an email), a number, a
 * yes or no, or a choice. Its default applies while it is left empty; the plugin checks the rest.
 */
export const pluginSettingFieldSchema = z.discriminatedUnion('kind', [
  z.object({
    ...settingWords,
    kind: z.literal('text'),
    format: z.enum(['text', 'url', 'email']),
    maxLength: z.number().int().nullable(),
    default: z.string().nullable(),
  }),
  z.object({
    ...settingWords,
    kind: z.literal('number'),
    integer: z.boolean(),
    min: z.number().nullable(),
    max: z.number().nullable(),
    default: z.number().nullable(),
  }),
  z.object({ ...settingWords, kind: z.literal('boolean'), default: z.boolean().nullable() }),
  z.object({
    ...settingWords,
    kind: z.literal('choice'),
    options: z.array(z.object({ value: z.string(), label: translatedSchema })),
    default: z.string().nullable(),
  }),
]);

export type PluginSettingField = z.infer<typeof pluginSettingFieldSchema>;

/** Settings an administrator saves, by name: those left empty take their default. */
export const pluginSettingValuesSchema = z
  .record(settingNameSchema, pluginSettingValueSchema)
  .refine((values) => Object.keys(values).length <= SETTINGS_MAX, {
    message: `At most ${SETTINGS_MAX} settings`,
  })
  .refine(
    (values) =>
      new TextEncoder().encode(JSON.stringify(values)).length <= PLUGIN_SETTINGS_MAX_BYTES,
    { message: `At most ${PLUGIN_SETTINGS_MAX_BYTES} bytes of settings` },
  );

export type PluginSettingValues = z.infer<typeof pluginSettingValuesSchema>;

/** Body of `PUT /api/v1/plugins/:pluginSlug/settings`, checked by the plugin before it is kept. */
export const savePluginSettingsRequestSchema = z.object({ values: pluginSettingValuesSchema });

export type SavePluginSettingsRequest = z.infer<typeof savePluginSettingsRequestSchema>;

/** A plugin as the list of installed ones shows it. */
export const pluginSummarySchema = z.object({
  slug: z.string(),
  /** "Time tracking", in each language. */
  name: translatedSchema,
  version: z.string(),
  state: z.enum(PLUGIN_STATES),
  /** Where its logo is served, a new address for each package; `null` when it has none. */
  logoUrl: z.string().nullable(),
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
  /** What it does, in a sentence, in each language. */
  description: translatedSchema,
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
      label: translatedSchema,
    }),
  ),
  /**
   * The properties it adds to issues, named in each language: typed in by people, or written by
   * the plugin alone.
   */
  properties: z.array(
    z.object({
      name: translatedSchema,
      type: z.enum(PROPERTY_TYPES),
      writtenBy: z.enum(PROPERTY_WRITERS),
      display: z.enum(PROPERTY_DISPLAYS).nullable(),
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
  /** Its runs that failed in a row: at 10, Toppo disables it. */
  failures: z.number().int().nonnegative(),
  /** How its last run that failed went wrong, and in what (`issue.statusChanged`, `action …`). */
  lastFailure: z.object({ reason: z.enum(PLUGIN_FAILURES), during: z.string() }).nullable(),
  settings: z.object({
    fields: z.array(pluginSettingFieldSchema),
    /** As saved, for the settings it still has. */
    values: z.record(z.string(), pluginSettingValueSchema),
    /** Its code refuses them since an upgrade: it waits for them to be corrected, then approved. */
    refused: z.boolean(),
    /** The projects whose own settings it refuses since an upgrade, to be corrected likewise. */
    refusedProjects: z.array(z.object({ key: z.string(), name: z.string() })),
  }),
});

export type PluginDetailsResponse = z.infer<typeof pluginDetailsResponseSchema>;

/** Body of `POST /api/v1/plugins/:pluginSlug/approve`: where it may act. */
export const approvePluginRequestSchema = z.object({
  /** Every project, present and future, or these ones. */
  projects: z.union([z.literal('all'), z.array(projectKeySchema).max(PLUGIN_PROJECTS_MAX)]),
});

export type ApprovePluginRequest = z.infer<typeof approvePluginRequestSchema>;

/** `timeEntry.log`: a resource, a dot, an action. Mirrors the SDK's names. */
const actionNameSchema = z
  .string()
  .max(60)
  .regex(/^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/);

export const pluginActionParamsSchema = z.object({
  pluginSlug: pluginSlugSchema,
  action: actionNameSchema,
});

/** What an action's input may weigh, as JSON: what a screen sends, not files. */
export const PLUGIN_ACTION_INPUT_MAX_BYTES = 64 * 1024;

/** Body of `POST /api/v1/plugins/:pluginSlug/actions/:action`: the plugin checks it. */
export const pluginActionRequestSchema = z.record(z.string(), z.unknown());

/** Its answer: what the action answered, as the plugin's screens expect it. */
export const pluginActionResponseSchema = z.object({ result: z.unknown() });

export type PluginActionResponse = z.infer<typeof pluginActionResponseSchema>;

/** A plugin at work in a project, with the settings the project sets for itself. */
export const projectPluginSchema = z.object({
  slug: z.string(),
  name: translatedSchema,
  /** `null` when it has none, or is not enabled: its logo is then for administrators only. */
  logoUrl: z.string().nullable(),
  fields: z.array(pluginSettingFieldSchema),
  values: z.record(z.string(), pluginSettingValueSchema),
  /** Its code refuses them since an upgrade: it waits for them to be corrected. */
  refused: z.boolean(),
});

export type ProjectPlugin = z.infer<typeof projectPluginSchema>;

/**
 * Body of `GET /api/v1/projects/:projectKey/plugins`: the plugins at work in the project that
 * take settings of it, by name.
 */
export const projectPluginsResponseSchema = z.object({ plugins: z.array(projectPluginSchema) });

export type ProjectPluginsResponse = z.infer<typeof projectPluginsResponseSchema>;

export const projectPluginParamsSchema = z.object({
  projectKey: projectKeySchema,
  pluginSlug: pluginSlugSchema,
});
