import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from '@toppo-tracker/shared';
import { en } from './en.messages.ts';
import { fr } from './fr.messages.ts';
import type { Messages, Translate } from './i18n.types.ts';

const CATALOGS: Record<Locale, Messages> = { en, fr };

const PLACEHOLDER = /\{(\w+)\}/g;

/** Returns the translation function of a locale. Unknown keys and missing parameters throw: they are bugs. */
export function createTranslator(locale: Locale): Translate {
  const messages = CATALOGS[locale];
  return (key, ...[params]) => {
    const message = lookup(messages, key);
    return message.replace(PLACEHOLDER, (_match, name: string) => {
      const value = (params as Record<string, string | number> | undefined)?.[name];
      if (value === undefined) {
        throw new Error(`Missing parameter "${name}" for message "${key}"`);
      }
      return String(value);
    });
  };
}

function lookup(messages: Messages, key: string): string {
  let node: unknown = messages;
  for (const segment of key.split('.')) {
    node = typeof node === 'object' && node !== null ? Reflect.get(node, segment) : undefined;
  }
  if (typeof node !== 'string') {
    throw new Error(`Unknown message key "${key}"`);
  }
  return node;
}

/** Picks the first supported locale from the browser preferences, English otherwise. */
export function detectLocale(preferred: readonly string[]): Locale {
  for (const tag of preferred) {
    const language = tag.toLowerCase().split('-')[0];
    const match = SUPPORTED_LOCALES.find((locale) => locale === language);
    if (match) {
      return match;
    }
  }
  return DEFAULT_LOCALE;
}
