import {
  type Locale,
  PLUGIN_SETTING_TEXT_MAX_LENGTH,
  type PluginSettingField,
  type PluginSettingValue,
  type PluginSettingValues,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import type { Translate } from '../../../shared/i18n/i18n.types.ts';

/** What the settings form holds: what was typed or chosen. A setting left empty takes its default. */
export type SettingsForm = Readonly<Record<string, string | boolean>>;

/** What a save sends: the settings typed, and the secrets to clear; a secret left empty is kept. */
export interface SettingsRequest {
  values: PluginSettingValues;
  clearSecrets: readonly string[];
}

type Read = { value: PluginSettingValue } | { error: string };

/** The form as the settings saved leave it: a yes or no is never empty, its default shown. */
export function settingsForm(
  fields: readonly PluginSettingField[],
  saved: Readonly<Record<string, PluginSettingValue>>,
  locale: Locale,
): SettingsForm {
  // A number as its reader writes it (22,5 in French), with nothing the form could not read back.
  const number = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
  return Object.fromEntries(
    fields.map((field) => {
      const value = Object.hasOwn(saved, field.name) ? saved[field.name] : undefined;
      if (field.kind === 'boolean') {
        return [field.name, typeof value === 'boolean' ? value : (field.default ?? false)];
      }
      if (typeof value === 'number') {
        return [field.name, number.format(value)];
      }
      return [field.name, typeof value === 'string' ? value : ''];
    }),
  );
}

/**
 * The settings to save from the form, those left empty left out; or why some cannot be, by
 * setting. The plugin checks them again: these are the limits its form shows.
 */
export function settingsRequest(
  fields: readonly PluginSettingField[],
  form: SettingsForm,
  t: Translate,
): { values: PluginSettingValues; errors: Record<string, string> } {
  const values: Record<string, PluginSettingValue> = {};
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const typed = form[field.name];
    if (field.kind === 'boolean') {
      values[field.name] = typed === true;
      continue;
    }
    const text = typeof typed === 'string' ? typed.trim() : '';
    if (text === '') {
      continue;
    }
    const read = readSetting(field, text, t);
    if ('error' in read) {
      errors[field.name] = read.error;
    } else {
      values[field.name] = read.value;
    }
  }
  return { values, errors };
}

function readSetting(
  field: Exclude<PluginSettingField, { kind: 'boolean' }>,
  text: string,
  t: Translate,
): Read {
  switch (field.kind) {
    case 'number':
      return readNumber(field, text, t);
    case 'choice':
      return field.options.some(({ value }) => value === text)
        ? { value: text }
        : { error: t('validation.invalid') };
    case 'text':
      return readText(field, text, t);
  }
}

function readNumber(
  field: Extract<PluginSettingField, { kind: 'number' }>,
  text: string,
  t: Translate,
): Read {
  // Typed as French writes it too: 1,5.
  const value = Number(text.replace(',', '.'));
  if (!Number.isFinite(value)) {
    return { error: t('validation.number') };
  }
  if (field.integer && !Number.isInteger(value)) {
    return { error: t('validation.wholeNumber') };
  }
  if (field.min !== null && value < field.min) {
    return { error: t('validation.atLeast', { min: field.min }) };
  }
  if (field.max !== null && value > field.max) {
    return { error: t('validation.atMost', { max: field.max }) };
  }
  return { value };
}

function readText(
  field: Extract<PluginSettingField, { kind: 'text' }>,
  text: string,
  t: Translate,
): Read {
  const max = Math.min(
    field.maxLength ?? PLUGIN_SETTING_TEXT_MAX_LENGTH,
    PLUGIN_SETTING_TEXT_MAX_LENGTH,
  );
  if (text.length > max) {
    return { error: t('validation.tooLong', { max }) };
  }
  if (field.format === 'email' && !z.email().safeParse(text).success) {
    return { error: t('validation.email') };
  }
  if (field.format === 'url' && !z.url().safeParse(text).success) {
    return { error: t('validation.url') };
  }
  return { value: text };
}
