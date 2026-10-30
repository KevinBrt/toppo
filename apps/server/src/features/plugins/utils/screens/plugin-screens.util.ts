import { scopeOf } from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import {
  type Manifest,
  manifestSchema,
  type PageDeclaration,
  type PanelDeclaration,
  type ScreenAccess,
} from '@toppo-tracker/plugin-sdk/protocol';
import type { PluginScreen } from '@toppo-tracker/shared';
import { and, asc, eq, type SQL } from 'drizzle-orm';
import type { Actor } from '../../../../platform/auth/actor.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { pluginNameOf, translated } from '../../../../platform/plugins/plugin-words.ts';

const { plugins } = schema;

/** An enabled plugin, as its screens are listed and served from it. */
export interface ScreenPlugin {
  slug: string;
  sha256: string;
  manifest: Manifest;
}

/** The enabled plugins `which` selects, their manifests as installed, oldest first. */
export async function enabledPlugins(db: Pick<Db, 'select'>, which?: SQL): Promise<ScreenPlugin[]> {
  const rows = await db
    .select({ slug: plugins.slug, sha256: plugins.packageSha256, manifest: plugins.manifest })
    .from(plugins)
    .where(and(eq(plugins.state, 'enabled'), which))
    .orderBy(asc(plugins.createdAt));
  // Checked as it was installed: a manifest Toppo kept is one it accepted.
  return rows.map((row) => ({ ...row, manifest: manifestSchema.parse(row.manifest) }));
}

/**
 * Whether someone may open a screen: anyone signed in, or who holds its permission, the plugin's
 * own by its catalog name. A permission of the instance is held in it; one of projects, in the
 * project the screen shows (`inProject`) only: where no project is, a plugin of API 1.1 may not
 * ask for one.
 */
export function mayOpen(
  actor: Actor,
  plugin: ScreenPlugin,
  access: ScreenAccess,
  inProject?: readonly string[],
): boolean {
  if (access === 'authenticated') {
    return true;
  }
  const permission = Object.hasOwn(plugin.manifest.permissions, access.permission)
    ? `${plugin.slug}.${access.permission}`
    : access.permission;
  const held =
    inProject === undefined || scopeOf(permission, actor.pluginPermissions) === 'instance'
      ? actor.permissions
      : inProject;
  return held.includes(permission);
}

/** A screen as the web app lists it: its plugin, its name and title, its entry if it has one. */
export function screenOf(
  plugin: ScreenPlugin,
  screen: PageDeclaration | PanelDeclaration,
): PluginScreen {
  const { messages } = plugin.manifest;
  const nav = 'nav' in screen ? screen.nav : undefined;
  return {
    pluginSlug: plugin.slug,
    plugin: pluginNameOf(plugin.manifest),
    name: screen.name,
    title: translated(messages, screen.title, screen.name),
    entry: nav ? { label: translated(messages, nav.label, screen.name), icon: nav.icon } : null,
  };
}

export function screenNotFound(): HttpError {
  return new HttpError(404, 'SCREEN_NOT_FOUND', 'This screen does not exist');
}
