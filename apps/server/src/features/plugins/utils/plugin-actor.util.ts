import { type Db, schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../platform/auth/actor.ts';
import { pluginPermissionsOf } from '../../../platform/plugins/plugin-permissions.ts';

const { pluginProjects, plugins, users } = schema;

/** An enabled plugin, ready to run: its package, and who it acts as. */
export interface ActingPlugin {
  id: string;
  slug: string;
  sha256: string;
  /** What it declared, as approved. */
  needs: readonly string[];
  settings: Record<string, unknown>;
  /** Its own user, holding its needs in its projects (`resolvePluginProject`). */
  actor: Actor;
}

/** Plugin `pluginId` as it acts now, or `null` once it is not enabled any more. */
export async function actingPlugin(db: Db, pluginId: string): Promise<ActingPlugin | null> {
  const [plugin] = await db
    .select({
      id: plugins.id,
      slug: plugins.slug,
      sha256: plugins.packageSha256,
      manifest: plugins.manifest,
      settings: plugins.settings,
      allProjects: plugins.allProjects,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(plugins)
    // Made with its approval, which enabling takes.
    .innerJoin(users, eq(users.pluginSlug, plugins.slug))
    .where(and(eq(plugins.id, pluginId), eq(plugins.state, 'enabled')));
  if (!plugin) {
    return null;
  }
  const { needs } = manifestSchema.parse(plugin.manifest);
  const projects = plugin.allProjects
    ? []
    : await db
        .select({ id: pluginProjects.projectId })
        .from(pluginProjects)
        .where(eq(pluginProjects.pluginId, plugin.id));
  return {
    id: plugin.id,
    slug: plugin.slug,
    sha256: plugin.sha256,
    needs,
    settings: plugin.settings,
    actor: {
      id: plugin.userId,
      name: plugin.userName,
      email: plugin.userEmail,
      // Its needs apply in projects: none in the whole instance.
      permissions: [],
      pluginPermissions: await pluginPermissionsOf(db),
      plugin: {
        slug: plugin.slug,
        needs,
        allProjects: plugin.allProjects,
        projectIds: projects.map(({ id }) => id),
      },
    },
  };
}
