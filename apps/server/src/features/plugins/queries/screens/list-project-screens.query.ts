import { type PluginPlacedScreensResponse, projectIssuesParamsSchema } from '@toppo-tracker/shared';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { actsInProject } from '../../utils/plugin-rows.util.ts';
import { enabledPlugins, mayOpen, screenOf } from '../../utils/screens/plugin-screens.util.ts';

/**
 * The tabs plugins add to a project's settings that the person may open: of the enabled plugins
 * at work in the project, those whose access they meet there.
 */
export const listProjectScreens = defineQuery({
  name: 'plugin.listProjectScreens',
  access: { project: 'projectKey' },
  input: projectIssuesParamsSchema,
  async handler({ db, actor, project }): Promise<PluginPlacedScreensResponse> {
    const found = await enabledPlugins(db, actsInProject(project.id));
    return {
      screens: found.flatMap((plugin) =>
        plugin.manifest.pages
          .filter(
            (page) =>
              page.zone === 'project.settings' &&
              mayOpen(actor, plugin, page.access, project.permissions),
          )
          .map((page) => screenOf(plugin, page)),
      ),
    };
  },
});
