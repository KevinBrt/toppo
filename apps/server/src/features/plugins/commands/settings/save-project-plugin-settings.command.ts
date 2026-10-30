import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { projectPluginParamsSchema, savePluginSettingsRequestSchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import { defineDetachedCommand } from '../../../../platform/cqrs/cqrs.ts';
import { actsInProject, pluginNotFound } from '../../utils/plugin-rows.util.ts';
import {
  assertSettingsDeclared,
  checkTypedSettings,
} from '../../utils/settings/settings-check.util.ts';
import { storeProjectPluginSettings } from './store-project-plugin-settings.command.ts';

const { plugins } = schema;

/**
 * Saves what a project sets for itself of a plugin at work in it, once the plugin's own schema
 * accepted it, in its sandbox: whatever the plugin's state. Holds no transaction while the
 * plugin checks them. Settings refused since an upgrade are so corrected.
 */
export const saveProjectPluginSettings = defineDetachedCommand({
  name: 'plugin.saveProjectSettings',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: savePluginSettingsRequestSchema.extend(projectPluginParamsSchema.shape),
  async handler(
    { db, actor, project, log, services },
    { projectKey, pluginSlug, values },
  ): Promise<void> {
    const [plugin] = await db
      .select({ sha256: plugins.packageSha256, manifest: plugins.manifest })
      .from(plugins)
      .where(and(eq(plugins.slug, pluginSlug), actsInProject(project.id)));
    // Checked as it was installed: a manifest Toppo kept is one it accepted.
    const declared = plugin && manifestSchema.parse(plugin.manifest).projectSettings;
    if (!(plugin && declared && Object.keys(declared.properties).length > 0)) {
      throw pluginNotFound();
    }
    assertSettingsDeclared(declared, values);
    await checkTypedSettings(
      { services, log },
      { slug: pluginSlug, sha256: plugin.sha256 },
      'project',
      values,
    );
    await storeProjectPluginSettings.execute(
      { db, actor, log, services },
      { projectKey, pluginSlug, sha256: plugin.sha256, values },
    );
  },
});
