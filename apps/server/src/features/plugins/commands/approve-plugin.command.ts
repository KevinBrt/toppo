import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { approvePluginRequestSchema, pluginSlugSchema } from '@toppo-tracker/shared';
import { eq, inArray, sql } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { pluginNameOf } from '../../../platform/plugins/plugin-words.ts';
import { assertSettingsAccepted, lockPlugin } from '../utils/plugin-rows.util.ts';
import { ensurePluginUser } from '../utils/plugin-user.util.ts';
import { addPluginProperties } from '../utils/properties/plugin-properties.util.ts';

const { pluginProjects, plugins, projects, users } = schema;

/**
 * Approves what a plugin declares, as it is now, in the projects chosen (or all of them), and
 * enables it, with a user of its own and the properties it adds to issues, named in the language
 * of whoever approves it, once its code takes its settings. The hosts inside the network it may
 * reach are named with it. Approving again changes its projects and those hosts; an upgrade that
 * asks for more is approved so. Only the package reviewed is approved: one uploaded meanwhile is
 * refused, to be reviewed in turn.
 */
export const approvePlugin = defineCommand({
  name: 'plugin.approve',
  access: { permission: 'instance.plugins.manage' },
  input: approvePluginRequestSchema.extend({ pluginSlug: pluginSlugSchema }),
  async handler(
    { tx, actor, log },
    { pluginSlug, packageSha256, projects: chosen, privateHosts },
  ): Promise<void> {
    const plugin = await lockPlugin(tx, pluginSlug);
    const [declared] = await tx
      .select({ manifest: plugins.manifest, packageSha256: plugins.packageSha256 })
      .from(plugins)
      .where(eq(plugins.id, plugin.id));
    if (declared?.packageSha256 !== packageSha256) {
      throw new HttpError(
        409,
        'PLUGIN_CHANGED',
        'Another package of the plugin was uploaded since it was reviewed: review it again',
      );
    }
    await assertSettingsAccepted(tx, plugin);
    const projectIds = chosen === 'all' ? [] : await projectIdsOf(tx, chosen);
    const manifest = manifestSchema.parse(declared?.manifest);
    await ensurePluginUser(tx, pluginSlug, pluginNameOf(manifest).en);
    const [approver] = await tx
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, actor.id));
    await addPluginProperties(tx, manifest, approver?.locale ?? 'en');
    await tx.delete(pluginProjects).where(eq(pluginProjects.pluginId, plugin.id));
    if (projectIds.length > 0) {
      await tx
        .insert(pluginProjects)
        .values(projectIds.map((projectId) => ({ pluginId: plugin.id, projectId })));
    }
    await tx
      .update(plugins)
      .set({
        state: 'enabled',
        allProjects: chosen === 'all',
        privateHosts: [...new Set(privateHosts)],
        approvedById: actor.id,
        approvedAt: sql`now()`,
      })
      .where(eq(plugins.id, plugin.id));
    log.info(
      { plugin: pluginSlug, version: plugin.version, projects: chosen, privateHosts, by: actor.id },
      'Plugin approved and enabled',
    );
  },
});

/** The ids of the projects named, every one of which must exist. */
async function projectIdsOf(tx: Transaction, keys: readonly string[]): Promise<string[]> {
  const unique = [...new Set(keys)];
  if (unique.length === 0) {
    return [];
  }
  const found = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.key, unique));
  if (found.length !== unique.length) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
  }
  return found.map(({ id }) => id);
}
