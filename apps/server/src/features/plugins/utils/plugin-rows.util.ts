import { schema } from '@toppo-tracker/db';
import { manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { pluginDescriptionOf, pluginNameOf } from '../../../platform/plugins/plugin-words.ts';

const { pluginProjectSettings, pluginProjects, plugins } = schema;

export function pluginNotFound(): HttpError {
  return new HttpError(404, 'PLUGIN_NOT_FOUND', 'No plugin is installed by this name');
}

/** A plugin, locked until the transaction ends: its changes never cross. */
export async function lockPlugin(
  tx: Transaction,
  slug: string,
): Promise<{ id: string; version: string; approvedAt: Date | null; settingsRefused: boolean }> {
  const [plugin] = await tx
    .select({
      id: plugins.id,
      version: plugins.version,
      approvedAt: plugins.approvedAt,
      settingsRefused: plugins.settingsRefused,
    })
    .from(plugins)
    .where(eq(plugins.slug, slug))
    .for('update');
  if (!plugin) {
    throw pluginNotFound();
  }
  return plugin;
}

/**
 * Refuses to start a plugin whose code refuses its settings, the instance's or a project's: its
 * runs would fail.
 */
export async function assertSettingsAccepted(
  tx: Transaction,
  plugin: { id: string; settingsRefused: boolean },
): Promise<void> {
  const [project] = await tx
    .select({ id: pluginProjectSettings.id })
    .from(pluginProjectSettings)
    .where(
      and(eq(pluginProjectSettings.pluginId, plugin.id), eq(pluginProjectSettings.refused, true)),
    )
    .limit(1);
  if (plugin.settingsRefused || project) {
    throw new HttpError(
      409,
      'PLUGIN_SETTINGS_REFUSED',
      'This version of the plugin refuses its settings: correct them first',
    );
  }
}

/** The plugins that act in the project `projectId`: approved there, or in every project. */
export function actsInProject(projectId: string): SQL {
  return sql`(${plugins.allProjects} or exists (select 1 from ${pluginProjects} where ${pluginProjects.pluginId} = ${plugins.id} and ${pluginProjects.projectId} = ${projectId}))`;
}

/**
 * Where a plugin's logo is served, a new address for each package so that a browser never shows
 * the logo of another version; `null` when it has none.
 */
export function logoUrlOf(slug: string, sha256: string, hasLogo: boolean): string | null {
  return hasLogo ? `/api/v1/plugins/${slug}/logo?v=${sha256.slice(0, 16)}` : null;
}

/** The columns that say what a plugin is called, without its logo's bytes. */
export const PLUGIN_IDENTITY = {
  slug: plugins.slug,
  sha256: plugins.packageSha256,
  hasLogo: sql<boolean>`${plugins.logo} is not null`,
  name: sql<unknown>`${plugins.manifest}->'name'`,
  description: sql<unknown>`${plugins.manifest}->'description'`,
  messages: sql<unknown>`${plugins.manifest}->'messages'`,
} as const;

/** What a plugin is called and does, in each language, and where its logo is. */
export function identityOf(row: {
  slug: string;
  sha256: string;
  hasLogo: boolean;
  name: unknown;
  description: unknown;
  messages: unknown;
}) {
  const words = {
    id: row.slug,
    name: manifestSchema.shape.name.safeParse(row.name).data,
    description: manifestSchema.shape.description.safeParse(row.description).data,
    messages: manifestSchema.shape.messages.safeParse(row.messages).data ?? { en: {}, fr: {} },
  };
  return {
    name: pluginNameOf(words),
    description: pluginDescriptionOf(words),
    logoUrl: logoUrlOf(row.slug, row.sha256, row.hasLogo),
  };
}
