import { describe, expect, it } from 'vitest';
import {
  PLUGIN_SETTING_TEXT_MAX_LENGTH,
  PLUGIN_SETTINGS_MAX_BYTES,
  pluginActionParamsSchema,
  pluginSettingValuesSchema,
  pluginSlugSchema,
  savePluginSettingsRequestSchema,
} from './plugins.ts';

describe('a plugin’s id', () => {
  it.each(['time-tracking', 'git', 'slack2'])('takes %s', (slug) => {
    expect(pluginSlugSchema.safeParse(slug).success).toBe(true);
  });

  it.each(['Time_Tracking', 'gh', 'ends-', '2fa', 'x'.repeat(41)])('refuses %s', (slug) => {
    expect(pluginSlugSchema.safeParse(slug).success).toBe(false);
  });
});

describe('an action’s name', () => {
  it('is a resource, a dot, an action', () => {
    const params = (action: string) =>
      pluginActionParamsSchema.safeParse({ pluginSlug: 'time-tracking', action }).success;

    expect(params('timeEntry.log')).toBe(true);
    expect(params('log')).toBe(false);
    expect(params('timeEntry.')).toBe(false);
  });
});

describe('a plugin’s settings, as saved', () => {
  it('are texts, numbers and yes or no, by name', () => {
    const values = { hoursPerDay: 7.5, team: 'Billing', billable: false };

    expect(savePluginSettingsRequestSchema.parse({ values })).toStrictEqual({
      values,
      clearSecrets: [],
    });
    expect(
      savePluginSettingsRequestSchema.parse({ values, clearSecrets: ['summaryUrl'] }).clearSecrets,
    ).toStrictEqual(['summaryUrl']);
  });

  it.each([
    ['a name that is no word', { 'max-hours': 8 }],
    ['a list', { teams: ['Billing'] }],
    ['nothing', { team: null }],
    ['a text too long', { team: 'x'.repeat(PLUGIN_SETTING_TEXT_MAX_LENGTH + 1) }],
    [
      'more settings than a plugin has',
      Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`setting${i}`, true])),
    ],
    [
      'more than they may weigh',
      Object.fromEntries(
        Array.from({ length: 20 }, (_, i) => [
          `text${i}`,
          'é'.repeat(PLUGIN_SETTING_TEXT_MAX_LENGTH),
        ]),
      ),
    ],
  ])('refuse %s', (_, values) => {
    expect(pluginSettingValuesSchema.safeParse(values).success).toBe(false);
  });

  it('weigh their bytes, not their characters', () => {
    // Under the limit in characters, over it in bytes: each "é" takes two.
    const values = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`text${i}`, 'é'.repeat(PLUGIN_SETTING_TEXT_MAX_LENGTH)]),
    );

    expect(JSON.stringify(values).length).toBeLessThan(PLUGIN_SETTINGS_MAX_BYTES);
    expect(pluginSettingValuesSchema.safeParse(values).success).toBe(false);
  });
});
