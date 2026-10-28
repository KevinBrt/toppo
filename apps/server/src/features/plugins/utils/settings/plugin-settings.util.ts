import type { Manifest, Setting } from '@toppo-tracker/plugin-sdk/protocol';
import {
  type PluginSettingField,
  type PluginSettingValue,
  pluginSettingValueSchema,
} from '@toppo-tracker/shared';
import { messageAt, translated } from '../../../../platform/plugins/plugin-words.ts';

/** How the form draws a text: an address or an email as such, any other format as plain text. */
const TEXT_FORMATS: ReadonlyMap<string, 'url' | 'email'> = new Map([
  ['uri', 'url'],
  ['email', 'email'],
]);

/** Where a plugin's settings are set: the instance (`settings`), or each project. */
export type SettingsScope = 'settings' | 'projectSettings';

/**
 * A plugin's settings, the instance's or a project's, as their form draws them, named in each
 * language by its own messages.
 */
export function settingFieldsOf(manifest: Manifest, scope: SettingsScope): PluginSettingField[] {
  return Object.entries(manifest[scope].properties).map(([name, setting]) =>
    fieldOf(manifest.messages, `${scope}.${name}`, name, setting),
  );
}

function fieldOf(
  messages: Manifest['messages'],
  /** Where its words are: `settings.hoursPerDay`. */
  key: string,
  name: string,
  setting: Setting,
): PluginSettingField {
  const help = `${key}.help`;
  const words = {
    name,
    label: translated(messages, `${key}.label`, name),
    help: messageAt(messages.en, help) === undefined ? null : translated(messages, help, ''),
  };
  if (setting.type === 'boolean') {
    return { ...words, kind: 'boolean', default: setting.default ?? null };
  }
  if (setting.type !== 'string') {
    return {
      ...words,
      kind: 'number',
      integer: setting.type === 'integer',
      min: setting.minimum ?? null,
      max: setting.maximum ?? null,
      default: setting.default ?? null,
    };
  }
  if ('enum' in setting) {
    return {
      ...words,
      kind: 'choice',
      options: setting.enum.map((value) => ({
        value,
        label: translated(messages, `${key}.options.${value}`, value),
      })),
      default: setting.default ?? null,
    };
  }
  return {
    ...words,
    kind: 'text',
    format: TEXT_FORMATS.get(setting.format ?? '') ?? 'text',
    maxLength: setting.maxLength ?? null,
    default: setting.default ?? null,
  };
}

/** The settings saved that the plugin still has: an upgrade may have dropped some. */
export function savedValuesOf(
  manifest: Manifest,
  scope: SettingsScope,
  saved: Record<string, unknown>,
): Record<string, PluginSettingValue> {
  return Object.fromEntries(
    Object.keys(manifest[scope].properties).flatMap((name) => {
      const value = pluginSettingValueSchema.safeParse(
        Object.hasOwn(saved, name) ? saved[name] : undefined,
      );
      return value.success ? [[name, value.data]] : [];
    }),
  );
}
