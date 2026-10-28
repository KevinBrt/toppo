import { type PermissionScope, type PluginPermission, pluginUserOf } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import { type Messages, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { asc, sql } from 'drizzle-orm';

const { plugins } = schema;

/** A plugin's section of the roles and permissions matrix. */
export interface PluginPermissionSection {
  slug: string;
  /** As its user is named: "Time tracking". */
  name: string;
  permissions: {
    /** As the catalog names it: `time-tracking.entries.log`. */
    name: string;
    scope: PermissionScope;
    /** From the plugin's own words, in each language. */
    label: { en: string; fr: string };
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
    })
    .from(plugins)
    .orderBy(asc(plugins.slug));
  return rows.map(({ slug, permissions, messages }) => {
    const words = manifestSchema.shape.messages.safeParse(messages).data ?? { en: {}, fr: {} };
    return {
      slug,
      name: pluginUserOf(slug).name,
      permissions: declared(permissions).map(([name, { scope, label }]) => ({
        name: `${slug}.${name}`,
        scope,
        label: {
          en: messageAt(words.en, label) ?? name,
          fr: messageAt(words.fr, label) ?? messageAt(words.en, label) ?? name,
        },
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

/** The message at `key` (`permissions.log`), if there is one. */
function messageAt(messages: Messages, key: string): string | undefined {
  let found: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    found = typeof found === 'object' && Object.hasOwn(found, part) ? found[part] : undefined;
  }
  return typeof found === 'string' ? found : undefined;
}
