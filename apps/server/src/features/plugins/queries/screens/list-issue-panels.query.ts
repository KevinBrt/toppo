import { type IssuePanelsResponse, issueKeyParamsSchema } from '@toppo-tracker/shared';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { actsInProject } from '../../utils/plugin-rows.util.ts';
import { enabledPlugins, mayOpen, screenOf } from '../../utils/screens/plugin-screens.util.ts';

/**
 * The panels plugins show beside an issue that the person may open: of the enabled plugins at
 * work in its project, those whose access they meet there.
 */
export const listIssuePanels = defineQuery({
  name: 'plugin.listIssuePanels',
  access: { project: 'issueKey', permission: 'issue.read' },
  input: issueKeyParamsSchema,
  async handler({ db, actor, project }): Promise<IssuePanelsResponse> {
    const found = await enabledPlugins(db, actsInProject(project.id));
    return {
      issue: {
        id: project.issue.id,
        key: project.issue.key,
        projectId: project.id,
        projectKey: project.key,
      },
      screens: found.flatMap((plugin) =>
        plugin.manifest.panels
          .filter(
            (panel) =>
              panel.on === 'issue' && mayOpen(actor, plugin, panel.access, project.permissions),
          )
          .map((panel) => screenOf(plugin, panel)),
      ),
    };
  },
});
