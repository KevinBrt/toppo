import { z } from 'zod';
import type { Messages } from '../manifest.ts';

/** At most this many settings in a plugin: one form, read at a glance. */
export const PLUGIN_SETTINGS_MAX = 30;

/** `hoursPerDay`: a setting's name, and the key of its words in the plugin's messages. */
export const SETTING_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;

/**
 * One setting, as Zod writes it in JSON Schema: what Toppo draws in a form. A choice among
 * values, a text (an address, an email…), a number, or yes or no; never null, never nested. Its
 * own schema checks it in the sandbox: these say only what to draw.
 */
export const settingSchema = z.union(
  [
    z.strictObject({
      type: z.literal('string'),
      enum: z.array(z.string().max(100)).min(1).max(50),
      default: z.string().max(100).optional(),
    }),
    z.strictObject({
      type: z.literal('string'),
      /** `uri` and `email` are drawn as such; any other as plain text. */
      format: z.string().max(40).optional(),
      pattern: z.string().max(1000).optional(),
      minLength: z.int().nonnegative().optional(),
      maxLength: z.int().nonnegative().optional(),
      default: z.string().max(1000).optional(),
      /** A secret (`secret()`): sealed by Toppo once typed, never shown again. */
      writeOnly: z.literal(true).optional(),
    }),
    z.strictObject({
      type: z.enum(['number', 'integer']),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      multipleOf: z.number().optional(),
      default: z.number().optional(),
    }),
    z.strictObject({ type: z.literal('boolean'), default: z.boolean().optional() }),
  ],
  {
    error: 'A setting is a text, a number, a yes or no, or a choice in a list: nothing nullable',
  },
);

export type Setting = z.infer<typeof settingSchema>;

/**
 * A plugin's settings, those of the instance or those each project sets: one object of settings,
 * as `z.toJSONSchema` writes it.
 */
export const settingsSchema = z.strictObject({
  $schema: z.string().max(200).optional(),
  type: z.literal('object'),
  properties: z
    .record(z.string().regex(SETTING_NAME, 'A setting is named like hoursPerDay'), settingSchema)
    .refine((settings) => Object.keys(settings).length <= PLUGIN_SETTINGS_MAX, {
      message: `At most ${PLUGIN_SETTINGS_MAX} settings`,
    }),
  required: z.array(z.string()).max(PLUGIN_SETTINGS_MAX).optional(),
  additionalProperties: z.literal(false).optional(),
});

export type SettingsSchema = z.infer<typeof settingsSchema>;

/** No settings: what a plugin that declares none answers. */
export const NO_SETTINGS_SCHEMA: SettingsSchema = { type: 'object', properties: {} };

/** Where a plugin's settings are set, by the key they go by in its manifest and messages. */
const SCOPES = ['settings', 'projectSettings'] as const;

/** The words at `path` in a plugin's messages, if there are some. */
function wordsAt(messages: Messages, path: readonly string[]): string | undefined {
  let found: Messages | string | undefined = messages;
  for (const part of path) {
    found = typeof found === 'object' && Object.hasOwn(found, part) ? found[part] : undefined;
  }
  return typeof found === 'string' ? found : undefined;
}

/** Refuses a secret a project would set, or a default would fill: it is the instance's, typed in. */
function checkSecret(
  scope: (typeof SCOPES)[number],
  name: string,
  setting: Setting,
  ctx: z.RefinementCtx,
): void {
  if (isSecretSetting(setting) && (scope === 'projectSettings' || 'default' in setting)) {
    ctx.addIssue({
      code: 'custom',
      path: [scope, 'properties', name],
      message: `The secret ${name} is the instance's, typed in: no project sets it, no default fills it`,
    });
  }
}

/** Whether a setting is a secret, sealed once typed (`secret()`). */
export function isSecretSetting(setting: Setting): boolean {
  return 'writeOnly' in setting && setting.writeOnly === true;
}

/**
 * Refuses settings Toppo could not offer, the instance's or a project's: one the plugin cannot run
 * without, since it runs before anyone sets it, and one without a label in each language, which
 * its form shows (`settings.<name>.label`, `projectSettings.<name>.label`). A secret is the
 * instance's, typed in, never given by default.
 */
export function checkSettings(
  manifest: Readonly<Record<(typeof SCOPES)[number], SettingsSchema>> & {
    messages: { en: Messages; fr: Messages };
  },
  ctx: z.RefinementCtx,
): void {
  for (const scope of SCOPES) {
    for (const name of manifest[scope].required ?? []) {
      ctx.addIssue({
        code: 'custom',
        path: [scope, 'required'],
        message: `The setting ${name} needs a default, or .optional(): the plugin runs before anyone sets it`,
      });
    }
    for (const [name, setting] of Object.entries(manifest[scope].properties)) {
      checkSecret(scope, name, setting, ctx);
      for (const locale of ['en', 'fr'] as const) {
        if (wordsAt(manifest.messages[locale], [scope, name, 'label']) === undefined) {
          ctx.addIssue({
            code: 'custom',
            path: ['messages', locale],
            message: `${scope}.${name}.label is missing: the form names each setting with it`,
          });
        }
      }
    }
  }
}
