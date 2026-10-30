import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../columns.ts';
import { projects } from '../projects.ts';
import { plugins } from './plugins.ts';

/**
 * What a project set for itself of a plugin's project settings, checked by its code. Kept while
 * the plugin no longer acts in the project, which it then cannot read: found again if it acts
 * there again. Gone with the plugin or the project.
 */
export const pluginProjectSettings = pgTable(
  'plugin_project_settings',
  {
    id: id(),
    pluginId: uuid('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull(),
    /**
     * The plugin's code refuses them, since an upgrade: the plugin waits for them to be
     * corrected, then to be approved again.
     */
    refused: boolean('refused').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('plugin_project_settings_plugin_project_unique').on(
      table.pluginId,
      table.projectId,
    ),
    index('plugin_project_settings_project_id_idx').on(table.projectId),
    check('plugin_project_settings_object', sql`jsonb_typeof(${table.settings}) = 'object'`),
    // Twice PLUGIN_SETTINGS_MAX_BYTES (`@toppo-tracker/shared`): PostgreSQL writes JSON looser.
    check('plugin_project_settings_size', sql`octet_length(${table.settings}::text) <= 32768`),
  ],
);
