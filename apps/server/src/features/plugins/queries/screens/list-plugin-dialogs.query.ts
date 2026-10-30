import { schema } from '@toppo-tracker/db';
import { type PluginDialogsResponse, pluginSlugParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { pluginNameOf, translated } from '../../../../platform/plugins/plugin-words.ts';
import {
  enabledPlugins,
  mayOpen,
  screenNotFound,
} from '../../utils/screens/plugin-screens.util.ts';

const { plugins } = schema;

/**
 * The dialogs of an enabled plugin the signed-in person may open, as its screens ask Toppo to:
 * each one's title, width and place, and the plugin's name, which Toppo shows with them.
 */
export const listPluginDialogs = defineQuery({
  name: 'plugin.listDialogs',
  access: 'authenticated',
  input: pluginSlugParamsSchema,
  async handler({ db, actor }, { pluginSlug }): Promise<PluginDialogsResponse> {
    const [plugin] = await enabledPlugins(db, eq(plugins.slug, pluginSlug));
    if (!plugin) {
      throw screenNotFound();
    }
    const { messages, dialogs } = plugin.manifest;
    return {
      plugin: pluginNameOf(plugin.manifest),
      dialogs: dialogs
        .filter((dialog) => mayOpen(actor, plugin, dialog.access))
        .map(({ name, title, size, side }) => ({
          name,
          title: translated(messages, title, name),
          size,
          side,
        })),
    };
  },
});
