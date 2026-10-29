import { type Db, schema } from '@toppo-tracker/db';
import { type Manifest, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../platform/auth/actor.ts';
import { throughPlugin } from '../../../platform/auth/project-access.ts';
import type { SecretBox } from '../../../platform/config/secret-box.ts';
import { pluginPermissionsOf } from '../../../platform/plugins/plugin-permissions.ts';
import { openSettings } from './settings/secret-settings.util.ts';

const { pluginProjects, plugins, users } = schema;

/** An enabled plugin, ready to run: its package, and who it acts as. */
export interface ActingPlugin {
  id: string;
  slug: string;
  sha256: string;
  /** What it declared, as approved. */
  manifest: Manifest;
  needs: readonly string[];
  /** As it reads them: its secrets opened. */
  settings: Record<string, unknown>;
  /** Hosts inside the network its approval lets it reach. */
  privateHosts: readonly string[];
  /** Its own user, holding its needs in its projects (`resolvePluginProject`). */
  actor: Actor;
}

/** A plugin as it acts now, by id or by slug, or `null` while it is not enabled. */
export async function actingPlugin(
  db: Db,
  which: { id: string } | { slug: string },
  secrets: SecretBox,
): Promise<ActingPlugin | null> {
  const [plugin] = await db
    .select({
      id: plugins.id,
      slug: plugins.slug,
      sha256: plugins.packageSha256,
      manifest: plugins.manifest,
      settings: plugins.settings,
      privateHosts: plugins.privateHosts,
      allProjects: plugins.allProjects,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
    })
    .from(plugins)
    // Made with its approval, which enabling takes.
    .innerJoin(users, eq(users.pluginSlug, plugins.slug))
    .where(
      and(
        'id' in which ? eq(plugins.id, which.id) : eq(plugins.slug, which.slug),
        eq(plugins.state, 'enabled'),
      ),
    );
  if (!plugin) {
    return null;
  }
  const manifest = manifestSchema.parse(plugin.manifest);
  const { needs } = manifest;
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
    manifest,
    needs,
    settings: openSettings(plugin.settings, secrets),
    privateHosts: plugin.privateHosts,
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

/**
 * The plugin acting for `person`, running one of its actions: what it writes is written by its
 * own user, while it reaches what both reach and holds what both hold.
 */
export function actingFor(plugin: ActingPlugin, person: Actor): Actor {
  const { plugin: reach } = plugin.actor;
  if (!reach) {
    throw new Error('A plugin acts with its reach');
  }
  return {
    ...plugin.actor,
    permissions: person.permissions.filter((permission) => throughPlugin(reach, permission)),
    plugin: { ...reach, onBehalfOf: person },
  };
}
