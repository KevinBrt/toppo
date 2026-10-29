import { schema } from '@toppo-tracker/db';
import { pluginSettingValueSchema, pluginSlugSchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { plugins } = schema;

/**
 * Keeps settings a plugin's code accepted, for the package that checked them: one uploaded
 * meanwhile would have to check them again. Settings refused since an upgrade are so corrected.
 */
export const storePluginSettings = defineCommand({
  name: 'plugin.storeSettings',
  access: { permission: 'instance.plugins.manage' },
  input: z.object({
    pluginSlug: pluginSlugSchema,
    /** The package whose code accepted them. */
    sha256: z.string(),
    /** As kept: its secrets sealed. */
    values: z.record(
      z.string(),
      z.union([pluginSettingValueSchema, z.strictObject({ sealed: z.string() })]),
    ),
  }),
  async handler({ tx, actor, log }, { pluginSlug, sha256, values }): Promise<void> {
    const [stored] = await tx
      .update(plugins)
      .set({ settings: values, settingsRefused: false })
      .where(and(eq(plugins.slug, pluginSlug), eq(plugins.packageSha256, sha256)))
      .returning({ version: plugins.version });
    if (!stored) {
      throw new HttpError(409, 'PLUGIN_CHANGED', 'The plugin changed meanwhile: save again');
    }
    // Which settings, not what they are: some are secrets.
    log.info(
      { plugin: pluginSlug, version: stored.version, settings: Object.keys(values), by: actor.id },
      'Plugin settings saved',
    );
  },
});
