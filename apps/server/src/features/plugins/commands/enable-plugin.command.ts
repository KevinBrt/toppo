import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { lockPlugin } from '../utils/plugin-rows.util.ts';

const { plugins } = schema;

/**
 * Enables a plugin disabled, by an administrator or for failing again and again, as it was
 * approved: its failures are counted again from zero.
 */
export const enablePlugin = defineCommand({
  name: 'plugin.enable',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ tx, actor, log }, { pluginSlug }): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    if (plugin.approvedAt === null) {
      throw new HttpError(
        409,
        'PLUGIN_NOT_APPROVED',
        'What this plugin declares waits for an approval',
      );
    }
    await tx
      .update(plugins)
      .set({ state: 'enabled', failures: 0 })
      .where(eq(plugins.id, plugin.id));
    log.info({ plugin: pluginSlug, version: plugin.version, by: actor.id }, 'Plugin enabled');
  },
});
