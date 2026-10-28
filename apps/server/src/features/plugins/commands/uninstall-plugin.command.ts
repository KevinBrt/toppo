import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { lockPlugin } from '../utils/plugin-rows.util.ts';

const { plugins } = schema;

/**
 * Removes a plugin: its approval, its projects and its settings. Its zip is swept from the disk
 * within the hour (`plugins.packages.sweep`), once this has committed.
 */
export const uninstallPlugin = defineCommand({
  name: 'plugin.uninstall',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ tx, actor, log }, { pluginSlug }): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    await tx.delete(plugins).where(eq(plugins.id, plugin.id));
    log.info({ plugin: pluginSlug, version: plugin.version, by: actor.id }, 'Plugin uninstalled');
  },
});
