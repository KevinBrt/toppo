import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema, uninstallPluginQuerySchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { forgetPluginPermissions } from '../utils/plugin-permissions.util.ts';
import { lockPlugin } from '../utils/plugin-rows.util.ts';
import { deletePluginProperties } from '../utils/properties/plugin-properties.util.ts';

const { pluginRecordSlots, pluginRecords, plugins } = schema;

/**
 * Removes a plugin: its approval, its projects, its settings, and its permissions from every
 * role; what it kept and the properties it added too, unless the administrator keeps them, to be
 * found again if it comes back (its properties hidden meanwhile).
 * Its zip is swept from the disk within the hour (`plugins.packages.sweep`), once this has
 * committed. Its user stays, so that what it wrote keeps its author.
 */
export const uninstallPlugin = defineCommand({
  name: 'plugin.uninstall',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema.extend(uninstallPluginQuerySchema.shape),
  async handler({ tx, actor, log }, { pluginSlug, data }): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    await forgetPluginPermissions(tx, pluginSlug, []);
    await tx.delete(plugins).where(eq(plugins.id, plugin.id));
    if (data === 'delete') {
      await tx.delete(pluginRecords).where(eq(pluginRecords.pluginSlug, pluginSlug));
      await tx.delete(pluginRecordSlots).where(eq(pluginRecordSlots.pluginSlug, pluginSlug));
      await deletePluginProperties(tx, pluginSlug, actor.id);
    }
    log.info(
      { plugin: pluginSlug, version: plugin.version, data, by: actor.id },
      'Plugin uninstalled',
    );
  },
});
