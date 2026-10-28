import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth.ts';
import { id, timestamps } from '../columns.ts';
import { issues } from '../issues.ts';
import { projects } from '../projects.ts';

/**
 * What plugins keep: the records of their entities, one table for all, checked by Toppo as each
 * entity declares. A record hangs on an issue, or on a project only, and is seen as it is; gone
 * with it. Named after its plugin's id, not its row: the records of a plugin uninstalled with its
 * data stay, found again if it comes back.
 */
export const pluginRecords = pgTable(
  'plugin_records',
  {
    id: id(),
    pluginSlug: text('plugin_slug').notNull(),
    /** As its plugin names it: `timeEntry`. */
    entity: text('entity').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** In the project above; `null` for a record on the project only. */
    issueId: uuid('issue_id').references(() => issues.id, { onDelete: 'cascade' }),
    /** Whoever the plugin wrote it for, or its own user. */
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    /** Its fields, as the entity declares them. */
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [
    // Each anchor first, for its foreign key and for the records on it, newest first.
    index('plugin_records_issue_idx').on(
      table.issueId,
      table.pluginSlug,
      table.entity,
      table.createdAt,
    ),
    index('plugin_records_project_idx').on(
      table.projectId,
      table.pluginSlug,
      table.entity,
      table.createdAt,
    ),
    index('plugin_records_created_by_idx').on(
      table.createdById,
      table.pluginSlug,
      table.entity,
      table.createdAt,
    ),
    index('plugin_records_plugin_idx').on(table.pluginSlug, table.entity),
    // Mirrors PLUGIN_ID and ENTITY_NAME (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugin_records_plugin_slug_format',
      sql`${table.pluginSlug} ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'`,
    ),
    check('plugin_records_entity_format', sql`${table.entity} ~ '^[a-z][A-Za-z0-9]{0,39}$'`),
    check('plugin_records_data_object', sql`jsonb_typeof(${table.data}) = 'object'`),
    // Twice RECORD_MAX_BYTES (`@toppo-tracker/plugin-sdk/protocol`): PostgreSQL writes JSON looser.
    check('plugin_records_data_size', sql`octet_length(${table.data}::text) <= 32768`),
  ],
);
