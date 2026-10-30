import { schema } from '@toppo-tracker/db';
import { pluginSlugSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { enabledPlugins, screenNotFound } from '../../utils/screens/plugin-screens.util.ts';

const { plugins } = schema;

/**
 * The package holding an enabled plugin's screens' bundle, as their frames load it. Public: a
 * frame has no origin, so its requests carry no session; what it loads is the code of a plugin
 * the instance runs, never data.
 */
export const getScreenBundle = defineQuery({
  name: 'plugin.screenBundle',
  access: 'public',
  input: z.object({ pluginSlug: pluginSlugSchema }),
  async handler({ db }, { pluginSlug }): Promise<{ slug: string; sha256: string }> {
    const [plugin] = await enabledPlugins(db, eq(plugins.slug, pluginSlug));
    if (!plugin || plugin.manifest.pages.length + plugin.manifest.panels.length === 0) {
      throw screenNotFound();
    }
    return { slug: plugin.slug, sha256: plugin.sha256 };
  },
});
