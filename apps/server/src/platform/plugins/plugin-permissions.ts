import type { PermissionScope, PluginPermission } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { asc, sql } from 'drizzle-orm';
import { pluginNameOf, type Translated, translated } from './plugin-words.ts';

const { plugins } = schema;

/** A plugin's section of the roles and permissions matrix. */
export interface PluginPermissionSection {
  slug: string;
  /** "Time tracking", in each language. */
  name: Translated;
  permissions: {
    /** As the catalog names it: `time-tracking.entries.log`. */
    name: string;
    scope: PermissionScope;
    /** From the plugin's own words, in each language. */
    label: Translated;
  }[];
}

/**
 * The permissions every installed plugin adds to the catalog, named after it, by plugin and
 * name: read on each request, from what its manifest declares and nothing more. A plugin that
 * waits for an approval is listed too: it runs nothing, so its permissions open nothing, and the
 * roles keep them through any save of the matrix.
 */
export async function pluginPermissionsOf(db: Pick<Db, 'select'>): Promise<PluginPermission[]> {
  const rows = await db
    .select({ slug: plugins.slug, permissions: sql<unknown>`${plugins.manifest}->'permissions'` })
    .from(plugins)
    .orderBy(asc(plugins.slug));
  return rows.flatMap(({ slug, permissions }) =>
    declared(permissions).map(([name, { scope }]) => ({ name: `${slug}.${name}`, scope })),
  );
}

/** The plugins' sections of the matrix, with their permissions' labels, by plugin and name. */
export async function pluginPermissionSections(
  db: Pick<Db, 'select'>,
): Promise<PluginPermissionSection[]> {
  const rows = await db
    .select({
      slug: plugins.slug,
      permissions: sql<unknown>`${plugins.manifest}->'permissions'`,
      messages: sql<unknown>`${plugins.manifest}->'messages'`,
      name: sql<unknown>`${plugins.manifest}->'name'`,
    })
    .from(plugins)
    .orderBy(asc(plugins.slug));
  return rows.map(({ slug, permissions, messages, name }) => {
    const words = manifestSchema.shape.messages.safeParse(messages).data ?? { en: {}, fr: {} };
    const key = manifestSchema.shape.name.safeParse(name).data;
    return {
      slug,
      name: pluginNameOf({ id: slug, name: key, messages: words }),
      permissions: declared(permissions).map(([permission, { scope, label }]) => ({
        name: `${slug}.${permission}`,
        scope,
        label: translated(words, label, permission),
      })),
    };
  });
}

/**
 * A plugin's permissions, as Toppo checked them when it was installed, by name. One this Toppo
 * cannot read any more adds none: read on every request, it must never fail them all.
 */
function declared(permissions: unknown) {
  // By code point: the same order on every server, whatever its locale.
  return Object.entries(manifestSchema.shape.permissions.safeParse(permissions).data ?? {}).sort(
    ([left], [right]) => (left < right ? -1 : 1),
  );
}
