import { schema } from '@toppo-tracker/db';
import { pluginSettingValuesSchema, projectPluginParamsSchema } from '@toppo-tracker/shared';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { pluginProjectSettings, plugins } = schema;

/**
 * Keeps what a project sets for itself of a plugin, as the plugin's code accepted it, for the
 * package that checked it: one uploaded meanwhile would have to check it again. Settings refused
 * since an upgrade are so corrected.
 */
export const storeProjectPluginSettings = defineCommand({
  name: 'plugin.storeProjectSettings',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectPluginParamsSchema.extend({
    /** The package whose code accepted them. */
    sha256: z.string(),
    values: pluginSettingValuesSchema,
  }),
  async handler({ tx, actor, project, log }, { pluginSlug, sha256, values }): Promise<void> {
    const [plugin] = await tx
      .select({ id: plugins.id, version: plugins.version })
      .from(plugins)
      .where(and(eq(plugins.slug, pluginSlug), eq(plugins.packageSha256, sha256)))
      .for('update');
    if (!plugin) {
      throw new HttpError(409, 'PLUGIN_CHANGED', 'The plugin changed meanwhile: save again');
    }
    await tx
      .insert(pluginProjectSettings)
      .values({ pluginId: plugin.id, projectId: project.id, settings: values })
      .onConflictDoUpdate({
        target: [pluginProjectSettings.pluginId, pluginProjectSettings.projectId],
        set: { settings: values, refused: false, updatedAt: sql`now()` },
      });
    // Which settings, not what they are: some may be secrets one day.
    log.info(
      {
        plugin: pluginSlug,
        version: plugin.version,
        project: project.key,
        settings: Object.keys(values),
        by: actor.id,
      },
      'Plugin project settings saved',
    );
  },
});
