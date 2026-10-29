import { isSecretSetting, type Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import type { PluginSettingValues } from '@toppo-tracker/shared';
import { z } from 'zod';
import type { SecretBox } from '../../../../platform/config/secret-box.ts';

/**
 * A secret as Toppo keeps it among a plugin's settings: sealed by the instance's key. An object,
 * never a text: forgotten unopened somewhere, it fails the plugin's schema rather than passing
 * for an address.
 */
const sealedSchema = z.strictObject({ sealed: z.string() });

export type StoredSetting = PluginSettingValues[string] | z.infer<typeof sealedSchema>;

/** The plugin's secrets, by name: settings of the instance's, sealed once typed. */
export function secretNamesOf(manifest: Manifest): Set<string> {
  return new Set(
    Object.entries(manifest.settings.properties).flatMap(([name, setting]) =>
      isSecretSetting(setting) ? [name] : [],
    ),
  );
}

/**
 * The settings as the plugin reads them: its secrets opened. One sealed with a key the instance
 * no longer has is left out, as if never typed: the plugin runs without it.
 */
export function openSettings(
  stored: Record<string, unknown>,
  secrets: SecretBox,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(stored).flatMap(([name, value]) => {
      const sealed = sealedSchema.safeParse(value);
      if (!sealed.success) {
        return [[name, value]];
      }
      const opened = secrets.open(sealed.data.sealed);
      return opened === null ? [] : [[name, opened]];
    }),
  );
}

/**
 * The settings to keep once saved: what was typed, its secrets sealed; the secrets left out keep
 * what they held, unless named to clear.
 */
export function settingsToStore(
  manifest: Manifest,
  saved: { values: PluginSettingValues; clearSecrets: readonly string[] },
  stored: Record<string, unknown>,
  secrets: SecretBox,
): Record<string, StoredSetting> {
  const names = secretNamesOf(manifest);
  const kept = [...names].flatMap((name) => {
    const sealed = sealedSchema.safeParse(stored[name]);
    return sealed.success &&
      !Object.hasOwn(saved.values, name) &&
      !saved.clearSecrets.includes(name)
      ? [[name, sealed.data]]
      : [];
  });
  const typed = Object.entries(saved.values).map(([name, value]) =>
    names.has(name) ? [name, { sealed: secrets.seal(String(value)) }] : [name, value],
  );
  return Object.fromEntries([...typed, ...kept]);
}
