import { pluginUserOf } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import type { PropertyPlugin } from '@toppo-tracker/shared';
import { inArray, type SQL, type SQLWrapper, sql } from 'drizzle-orm';
import type { Transaction } from '../cqrs/cqrs.ts';
import { pluginNameOf } from './plugin-words.ts';

const { pluginProjects, plugins, properties } = schema;

/**
 * Arbitrary but fixed: properties are added one at a time, by an administrator or a plugin's
 * approval, so that their number and their names are counted right.
 */
const PROPERTIES_LOCK_KEY = 7_461_756_331;

/** Holds the adding of properties until the end of the transaction. */
export async function lockPropertyAdding(tx: Transaction): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(${PROPERTIES_LOCK_KEY})`);
}

/**
 * Whether a property of the instance shows in `projectId` (an id, or a project's column), as a
 * condition on `properties`: Toppo's always; a plugin's while the plugin is enabled, acts in the
 * project, and still declares it. Kept from a version before, or by an uninstall keeping data,
 * it waits hidden, with its values, for the plugin to declare it again.
 */
export function shownFromInstance(projectId: string | SQLWrapper): SQL {
  return sql`(${properties.pluginSlug} is null or exists (
    select 1 from ${plugins}
    where ${plugins.slug} = ${properties.pluginSlug}
      and ${plugins.state} = 'enabled'
      and (${plugins.manifest} -> 'properties' -> ${properties.pluginProperty}) is not null
      and (${plugins.allProjects} or exists (
        select 1 from ${pluginProjects}
        where ${pluginProjects.pluginId} = ${plugins.id} and ${pluginProjects.projectId} = ${projectId}
      ))
  ))`;
}

/**
 * The properties a project's issues take, as a condition on `properties`: its own, and the
 * instance's that show there (`shownFromInstance`).
 */
export function propertiesOf(projectId: string): SQL {
  return sql`(${properties.projectId} = ${projectId} or (${properties.projectId} is null and ${shownFromInstance(projectId)}))`;
}

/**
 * The plugins that added properties, by id: their names in each language, and whether they are
 * installed. One uninstalled with its data is named after its id.
 */
export async function propertyPlugins(
  db: Pick<Db, 'select'>,
  slugs: readonly (string | null)[],
): Promise<Map<string, PropertyPlugin>> {
  const wanted = [...new Set(slugs.filter((slug) => slug !== null))];
  if (wanted.length === 0) {
    return new Map();
  }
  const installed = await db
    .select({ slug: plugins.slug, manifest: plugins.manifest })
    .from(plugins)
    .where(inArray(plugins.slug, wanted));
  return new Map(
    wanted.map((slug) => {
      const row = installed.find((plugin) => plugin.slug === slug);
      // Checked as it was installed: a manifest Toppo kept is one it accepted.
      const name = row
        ? pluginNameOf(manifestSchema.parse(row.manifest))
        : { en: pluginUserOf(slug).name, fr: pluginUserOf(slug).name };
      return [slug, { slug, name, installed: row !== undefined }];
    }),
  );
}
