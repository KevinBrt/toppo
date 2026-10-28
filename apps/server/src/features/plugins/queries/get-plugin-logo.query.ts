import { can } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { plugins } = schema;

/**
 * A plugin's logo, for whoever is signed in: those who manage plugins see every one's, others
 * those of the plugins at work only, so that a logo tells nobody what waits for an approval.
 */
export const getPluginLogo = defineQuery({
  name: 'plugin.logo',
  access: 'authenticated',
  input: pluginSlugParamsSchema,
  async handler(
    { db, actor },
    { pluginSlug },
  ): Promise<{ bytes: Buffer; mediaType: 'image/png' | 'image/webp' }> {
    const [plugin] = await db
      .select({ state: plugins.state, logo: plugins.logo, logoType: plugins.logoType })
      .from(plugins)
      .where(eq(plugins.slug, pluginSlug));
    const shown = plugin?.state === 'enabled' || can(actor.permissions, 'instance.plugins.manage');
    const mediaType = plugin?.logoType;
    if (!(shown && plugin?.logo && (mediaType === 'image/png' || mediaType === 'image/webp'))) {
      throw new HttpError(404, 'PLUGIN_LOGO_NOT_FOUND', 'This plugin has no logo to show');
    }
    return { bytes: plugin.logo, mediaType };
  },
});
