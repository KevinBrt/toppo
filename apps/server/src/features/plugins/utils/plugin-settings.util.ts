import type { Manifest, Setting } from '@toppo-tracker/plugin-sdk/protocol';
import {
  type PluginSettingField,
  type PluginSettingValue,
  pluginSettingValueSchema,
} from '@toppo-tracker/shared';
import { messageAt, translated } from '../../../platform/plugins/plugin-words.ts';

/** How the form draws a text: an address or an email as such, any other format as plain text. */
const TEXT_FORMATS: ReadonlyMap<string, 'url' | 'email'> = new Map([
  ['uri', 'url'],
  ['email', 'email'],
]);

/** A plugin's settings as its form draws them, named in each language by its own messages. */
export function settingFieldsOf(manifest: Manifest): PluginSettingField[] {
  return Object.entries(manifest.settings.properties).map(([name, setting]) =>
    fieldOf(manifest.messages, name, setting),
  );
}

function fieldOf(
  messages: Manifest['messages'],
  name: string,
  setting: Setting,
): PluginSettingField {
  const help = `settings.${name}.help`;
  const words = {
    name,
    label: translated(messages, `settings.${name}.label`, name),
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
        label: translated(messages, `settings.${name}.options.${value}`, value),
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
  saved: Record<string, unknown>,
): Record<string, PluginSettingValue> {
  return Object.fromEntries(
    Object.keys(manifest.settings.properties).flatMap((name) => {
      const value = pluginSettingValueSchema.safeParse(
        Object.hasOwn(saved, name) ? saved[name] : undefined,
      );
      return value.success ? [[name, value.data]] : [];
    }),
  );
}
