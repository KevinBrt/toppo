import { type Db, schema } from '@toppo-tracker/db';
import { screenFrameParamsSchema, screenFrameQuerySchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import type { Actor } from '../../../../platform/auth/actor.ts';
import { resolveIssue, resolveProject } from '../../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import type { ScreenFrame } from '../../../../platform/plugins/screens/screen-files.ts';
import { actsInProject } from '../../utils/plugin-rows.util.ts';
import {
  enabledPlugins,
  mayOpen,
  type ScreenPlugin,
  screenNotFound,
} from '../../utils/screens/plugin-screens.util.ts';

const { plugins, users } = schema;

/** Whether the plugin is at work in the project: approved there, or in every project. */
async function actsIn(db: Db, plugin: ScreenPlugin, projectId: string): Promise<boolean> {
  const found = await enabledPlugins(
    db,
    and(eq(plugins.slug, plugin.slug), actsInProject(projectId)),
  );
  return found.length > 0;
}

/**
 * Whether `actor` may open the screen: a page of the main sidebar or the settings by its access;
 * a project's tab or an issue's panel in a project they reach (404 otherwise), where the plugin is
 * at work, by its access there.
 */
async function mayOpenScreen(
  db: Db,
  actor: Actor,
  plugin: ScreenPlugin,
  screen: string,
  shown: { project?: string | undefined; issue?: string | undefined },
): Promise<boolean> {
  const page = plugin.manifest.pages.find(({ name }) => name === screen);
  if (page && page.zone !== 'project.settings') {
    return mayOpen(actor, plugin, page.access);
  }
  if (page) {
    const project = await resolveProject(db, actor, shown.project ?? null);
    return (
      (await actsIn(db, plugin, project.id)) &&
      mayOpen(actor, plugin, page.access, project.permissions)
    );
  }
  const panel = plugin.manifest.panels.find(({ name }) => name === screen);
  if (!panel) {
    // A dialog shows over whatever page opened it: opened as a page of the main sidebar is.
    const dialog = plugin.manifest.dialogs.find(({ name }) => name === screen);
    return dialog !== undefined && mayOpen(actor, plugin, dialog.access);
  }
  const project = await resolveIssue(db, actor, shown.issue);
  return (
    (await actsIn(db, plugin, project.id)) &&
    mayOpen(actor, plugin, panel.access, project.permissions)
  );
}

/**
 * A screen of an enabled plugin, for its frame, once the person may open it (`mayOpenScreen`).
 * Anything else is not found, as a screen that does not exist.
 */
export const getScreenFrame = defineQuery({
  name: 'plugin.screenFrame',
  access: 'authenticated',
  input: screenFrameParamsSchema.extend(screenFrameQuerySchema.shape),
  async handler({ db, actor }, { pluginSlug, screen, project, issue }): Promise<ScreenFrame> {
    const [plugin] = await enabledPlugins(db, eq(plugins.slug, pluginSlug));
    if (!(plugin && (await mayOpenScreen(db, actor, plugin, screen, { project, issue })))) {
      throw screenNotFound();
    }
    const [person] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, actor.id));
    return { slug: plugin.slug, sha256: plugin.sha256, screen, locale: person?.locale ?? 'en' };
  },
});
