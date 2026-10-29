import type { PluginScreensResponse } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { enabledPlugins, mayOpen, screenOf } from '../../utils/screens/plugin-screens.util.ts';

/**
 * The pages of enabled plugins the signed-in person may open, in the main sidebar and in the
 * settings: those they may not open, they never see an entry of.
 */
export const listPluginScreens = defineQuery({
  name: 'plugin.listScreens',
  access: 'authenticated',
  input: z.object({}),
  async handler({ db, actor }): Promise<PluginScreensResponse> {
    const found = await enabledPlugins(db);
    const pagesIn = (zone: 'main' | 'settings') =>
      found.flatMap((plugin) =>
        plugin.manifest.pages
          .filter((page) => page.zone === zone && mayOpen(actor, plugin, page.access))
          .map((page) => screenOf(plugin, page)),
      );
    return { main: pagesIn('main'), settings: pagesIn('settings') };
  },
});
