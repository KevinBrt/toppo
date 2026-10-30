import { schema } from '@toppo-tracker/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { projectKeyOf, resolveProject } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { pluginProjectSettings, plugins } = schema;

/**
 * What a project set for itself of the plugin's project settings, as the plugin reads them
 * (`ctx.projects.settings`): in a project it acts in, which whoever it acts for reaches too,
 * as for any project. Nothing set yet answers nothing: the plugin applies its defaults.
 */
export const readOwnProjectSettings = defineQuery({
  name: 'plugin.readOwnProjectSettings',
  access: 'authenticated',
  input: z.object({ projectId: z.uuid() }),
  async handler({ db, actor }, { projectId }): Promise<Record<string, unknown>> {
    if (!actor.plugin) {
      throw new HttpError(403, 'FORBIDDEN', 'A plugin reads its own settings');
    }
    const project = await resolveProject(db, actor, await projectKeyOf(db, projectId));
    const [saved] = await db
      .select({ settings: pluginProjectSettings.settings })
      .from(pluginProjectSettings)
      .innerJoin(plugins, eq(plugins.id, pluginProjectSettings.pluginId))
      .where(
        and(eq(plugins.slug, actor.plugin.slug), eq(pluginProjectSettings.projectId, project.id)),
      );
    return saved?.settings ?? {};
  },
});
