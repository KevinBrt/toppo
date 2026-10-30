import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { lockPlugin } from '../utils/plugin-rows.util.ts';

const { plugins } = schema;

/** Stops a plugin until an administrator enables it again; its approval and settings stay. */
export const disablePlugin = defineCommand({
  name: 'plugin.disable',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ tx, actor, log }, { pluginSlug }): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    await tx.update(plugins).set({ state: 'disabled' }).where(eq(plugins.id, plugin.id));
    log.info({ plugin: pluginSlug, version: plugin.version, by: actor.id }, 'Plugin disabled');
  },
});
