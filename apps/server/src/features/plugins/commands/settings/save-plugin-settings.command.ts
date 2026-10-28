import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { pluginSlugSchema, savePluginSettingsRequestSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineDetachedCommand } from '../../../../platform/cqrs/cqrs.ts';
import { pluginNotFound } from '../../utils/plugin-rows.util.ts';
import {
  assertSettingsDeclared,
  checkTypedSettings,
} from '../../utils/settings/settings-check.util.ts';
import { storePluginSettings } from './store-plugin-settings.command.ts';

const { plugins } = schema;

/**
 * Saves a plugin's settings once its own schema accepted them, in its sandbox: in any state, so
 * that it is set up before it runs. It holds no transaction while the plugin checks them.
 * Settings refused since an upgrade are so corrected.
 */
export const savePluginSettings = defineDetachedCommand({
  name: 'plugin.saveSettings',
  access: { permission: 'instance.plugins.manage' },
  input: savePluginSettingsRequestSchema.extend({ pluginSlug: pluginSlugSchema }),
  async handler({ db, actor, log, services }, { pluginSlug, values }): Promise<void> {
    const [plugin] = await db
      .select({ sha256: plugins.packageSha256, manifest: plugins.manifest })
      .from(plugins)
      .where(eq(plugins.slug, pluginSlug));
    if (!plugin) {
      throw pluginNotFound();
    }
    // Checked as it was installed: a manifest Toppo kept is one it accepted.
    assertSettingsDeclared(manifestSchema.parse(plugin.manifest).settings, values);
    await checkTypedSettings(
      { services, log },
      { slug: pluginSlug, sha256: plugin.sha256 },
      'instance',
      values,
    );
    await storePluginSettings.execute(
      { db, actor, log, services },
      { pluginSlug, sha256: plugin.sha256, values },
    );
  },
});
