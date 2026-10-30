import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { type ProjectPluginsResponse, projectKeyParamsSchema } from '@toppo-tracker/shared';
import { and, asc, eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { actsInProject, identityOf, PLUGIN_IDENTITY } from '../utils/plugin-rows.util.ts';
import { savedValuesOf, settingFieldsOf } from '../utils/settings/plugin-settings.util.ts';

const { pluginProjectSettings, plugins } = schema;

/**
 * The plugins at work in a project that take settings of it, whatever their state, with what
 * the project set for itself: at most one per plugin installed, loaded whole.
 */
export const listProjectPlugins = defineQuery({
  name: 'plugin.listInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema,
  async handler({ db, project }): Promise<ProjectPluginsResponse> {
    const rows = await db
      .select({
        ...PLUGIN_IDENTITY,
        state: plugins.state,
        manifest: plugins.manifest,
        settings: pluginProjectSettings.settings,
        refused: pluginProjectSettings.refused,
      })
      .from(plugins)
      .leftJoin(
        pluginProjectSettings,
        and(
          eq(pluginProjectSettings.pluginId, plugins.id),
          eq(pluginProjectSettings.projectId, project.id),
        ),
      )
      .where(actsInProject(project.id))
      .orderBy(asc(plugins.slug));
    return {
      plugins: rows.flatMap((row) => {
        // Checked as it was installed: a manifest Toppo kept is one it accepted.
        const manifest = manifestSchema.parse(row.manifest);
        const fields = settingFieldsOf(manifest, 'projectSettings', row.settings ?? {});
        if (fields.length === 0) {
          return [];
        }
        const { name, logoUrl } = identityOf(row);
        return [
          {
            slug: row.slug,
            name,
            // Those who do not manage plugins are served the logo of a plugin at work only.
            logoUrl: row.state === 'enabled' ? logoUrl : null,
            fields,
            values: savedValuesOf(manifest, 'projectSettings', row.settings ?? {}),
            refused: row.refused ?? false,
          },
        ];
      }),
    };
  },
});
