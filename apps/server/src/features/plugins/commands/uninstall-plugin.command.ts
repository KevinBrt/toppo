import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { forgetPluginPermissions } from '../utils/plugin-permissions.util.ts';
import { lockPlugin } from '../utils/plugin-rows.util.ts';

const { plugins } = schema;

/**
 * Removes a plugin: its approval, its projects, its settings, and its permissions from every
 * role. Its zip is swept from the disk within the hour (`plugins.packages.sweep`), once this has
 * committed. Its user stays, so that what it wrote keeps its author.
 */
export const uninstallPlugin = defineCommand({
  name: 'plugin.uninstall',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ tx, actor, log }, { pluginSlug }): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    await forgetPluginPermissions(tx, pluginSlug, []);
    await tx.delete(plugins).where(eq(plugins.id, plugin.id));
    log.info({ plugin: pluginSlug, version: plugin.version, by: actor.id }, 'Plugin uninstalled');
  },
});
