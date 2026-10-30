import { type Db, schema } from '@toppo-tracker/db';
import { type Manifest, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import { pluginNotFound } from '../plugin-rows.util.ts';

const { pluginProjects, plugins } = schema;

/** An enabled plugin whose screen asks Toppo's search: where it acts, and what it needs. */
export interface PickingPlugin {
  id: string;
  allProjects: boolean;
  manifest: Manifest;
}

/** The enabled plugin of that slug, or 404: a picker never says what a disabled one would find. */
export async function pickingPlugin(db: Pick<Db, 'select'>, slug: string): Promise<PickingPlugin> {
  const [found] = await db
    .select({ id: plugins.id, allProjects: plugins.allProjects, manifest: plugins.manifest })
    .from(plugins)
    .where(and(eq(plugins.slug, slug), eq(plugins.state, 'enabled')));
  if (!found) {
    throw pluginNotFound();
  }
  return { ...found, manifest: manifestSchema.parse(found.manifest) };
}

/**
 * The projects `project` may be for what a picker finds: one the plugin acts in, and the one the
 * screen named, if it did. A condition in SQL, as every list filters.
 */
export function pickedIn(
  plugin: PickingPlugin,
  project: SQLWrapper,
  named: string | undefined,
): SQL | undefined {
  return and(
    plugin.allProjects
      ? undefined
      : sql`exists (select 1 from ${pluginProjects}
          where ${pluginProjects.pluginId} = ${plugin.id} and ${pluginProjects.projectId} = ${project})`,
    named === undefined ? undefined : sql`${project} = ${named}`,
  );
}
