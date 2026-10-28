import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import {
  PLUGIN_PROJECTS_MAX,
  type PluginDetailsResponse,
  pluginSlugParamsSchema,
} from '@toppo-tracker/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { pluginNotFound } from '../utils/plugin-rows.util.ts';

const { pluginProjects, plugins, projects, users } = schema;

/** `null` once their account is deleted. */
const approverName = sql<
  string | null
>`case when ${users.deletedAt} is null then ${users.name} end`;

/** A plugin, with what its code declares and where it was approved to act. */
export const getPlugin = defineQuery({
  name: 'plugin.get',
  access: { permission: 'instance.plugins.manage' },
  input: pluginSlugParamsSchema,
  async handler({ db }, { pluginSlug }): Promise<PluginDetailsResponse> {
    const [plugin] = await db
      .select({
        id: plugins.id,
        slug: plugins.slug,
        version: plugins.version,
        state: plugins.state,
        manifest: plugins.manifest,
        packageSha256: plugins.packageSha256,
        allProjects: plugins.allProjects,
        approvedAt: plugins.approvedAt,
        approvedById: users.id,
        approvedByName: approverName,
        createdAt: plugins.createdAt,
        updatedAt: plugins.updatedAt,
      })
      .from(plugins)
      .leftJoin(users, eq(users.id, plugins.approvedById))
      .where(eq(plugins.slug, pluginSlug));
    if (!plugin) {
      throw pluginNotFound();
    }
    const chosen = await db
      .select({ id: projects.id, key: projects.key, name: projects.name })
      .from(pluginProjects)
      .innerJoin(projects, eq(projects.id, pluginProjects.projectId))
      .where(eq(pluginProjects.pluginId, plugin.id))
      .orderBy(asc(projects.key))
      .limit(PLUGIN_PROJECTS_MAX);
    // Checked as it was installed: a manifest Toppo kept is one it accepted.
    const manifest = manifestSchema.parse(plugin.manifest);
    return {
      slug: plugin.slug,
      version: plugin.version,
      state: plugin.state,
      packageSha256: plugin.packageSha256,
      apiVersion: manifest.apiVersion,
      needs: manifest.needs,
      permissions: Object.entries(manifest.permissions).map(([name, permission]) => ({
        name,
        ...permission,
      })),
      events: manifest.events,
      actions: manifest.actions.map((action) => action.name),
      allProjects: plugin.allProjects,
      projects: chosen,
      approval:
        plugin.approvedAt === null
          ? null
          : {
              by:
                plugin.approvedById === null
                  ? null
                  : { id: plugin.approvedById, name: plugin.approvedByName },
              at: plugin.approvedAt.toISOString(),
            },
      createdAt: plugin.createdAt.toISOString(),
      updatedAt: plugin.updatedAt.toISOString(),
    };
  },
});
