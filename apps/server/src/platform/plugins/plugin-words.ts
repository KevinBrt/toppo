import { pluginUserOf } from '@toppo-tracker/core';
import type { Messages } from '@toppo-tracker/plugin-sdk/protocol';
import type { Locale } from '@toppo-tracker/shared';

/** Words in each language Toppo speaks. */
export type Translated = Record<Locale, string>;

/** What a plugin's manifest says of its words, checked as it was installed. */
export interface PluginWords {
  id: string;
  /** Message keys: `plugin.name`. */
  name?: string | undefined;
  description?: string | undefined;
  messages: { en: Messages; fr: Messages };
}

/** The message at `key` (`permissions.log`), if there is one. */
export function messageAt(messages: Messages, key: string): string | undefined {
  let found: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    found = typeof found === 'object' && Object.hasOwn(found, part) ? found[part] : undefined;
  }
  return typeof found === 'string' ? found : undefined;
}

/** The plugin's message at `key` in each language, English when French lacks it, else `fallback`. */
export function translated(
  messages: PluginWords['messages'],
  key: string | undefined,
  fallback: string,
): Translated {
  const en = key === undefined ? undefined : messageAt(messages.en, key);
  const fr = key === undefined ? undefined : messageAt(messages.fr, key);
  return { en: en ?? fallback, fr: fr ?? en ?? fallback };
}

/** What a plugin is called, in each language: "Time tracking" from its id when it says nothing. */
export function pluginNameOf(plugin: PluginWords): Translated {
  return translated(plugin.messages, plugin.name, pluginUserOf(plugin.id).name);
}

/** What a plugin does, in a sentence, in each language. */
export function pluginDescriptionOf(plugin: PluginWords): Translated {
  return translated(plugin.messages, plugin.description, '');
}
