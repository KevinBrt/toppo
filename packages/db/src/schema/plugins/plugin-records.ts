import { sql } from 'drizzle-orm';
import { check, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../auth.ts';
import { id, timestamps } from '../columns.ts';
import { issues } from '../issues.ts';
import { projects } from '../projects.ts';

/**
 * The typed slots of a record, by kind: Toppo copies there the fields its entity indexes
 * (`plugin_record_slots`), for queries that filter, sort and group on them to use an index.
 * Mirrors ENTITY_INDEXES_MAX (`@toppo-tracker/plugin-sdk/protocol`).
 */
export const RECORD_SLOTS = {
  date: ['date1', 'date2', 'date3'],
  number: ['number1', 'number2', 'number3'],
  text: ['text1', 'text2', 'text3'],
  ref: ['ref1', 'ref2'],
} as const;

export type RecordSlot = (typeof RECORD_SLOTS)[keyof typeof RECORD_SLOTS][number];

export const ALL_RECORD_SLOTS: readonly RecordSlot[] = Object.values(RECORD_SLOTS).flat();

/** The longest text a slot keeps: an email's. Past it, an index row would not fit a page. */
export const RECORD_SLOT_TEXT_MAX_LENGTH = 320;

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
    // Copies of the fields its entity indexes, typed: a date at midnight UTC.
    date1: timestamp('date_1', { withTimezone: true }),
    date2: timestamp('date_2', { withTimezone: true }),
    date3: timestamp('date_3', { withTimezone: true }),
    number1: numeric('number_1'),
    number2: numeric('number_2'),
    number3: numeric('number_3'),
    text1: text('text_1'),
    text2: text('text_2'),
    text3: text('text_3'),
    ref1: uuid('ref_1'),
    ref2: uuid('ref_2'),
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
    // Each slot after a project or an author, which may hold any number of records: an issue
    // holds few enough (`ENTITY_LIMITS`) to be read whole. Partial, so that a record leaving a
    // slot empty costs it nothing.
    ...ALL_RECORD_SLOTS.flatMap((slot) => [
      index(`plugin_records_project_${slot}_idx`)
        .on(table.projectId, table.pluginSlug, table.entity, table[slot])
        .where(sql`${table[slot]} is not null`),
      index(`plugin_records_created_by_${slot}_idx`)
        .on(table.createdById, table.pluginSlug, table.entity, table[slot])
        .where(sql`${table[slot]} is not null`),
    ]),
    // Mirrors PLUGIN_ID and ENTITY_NAME (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugin_records_plugin_slug_format',
      sql`${table.pluginSlug} ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'`,
    ),
    check('plugin_records_entity_format', sql`${table.entity} ~ '^[a-z][A-Za-z0-9]{0,39}$'`),
    check('plugin_records_data_object', sql`jsonb_typeof(${table.data}) = 'object'`),
    // Twice RECORD_MAX_BYTES (`@toppo-tracker/plugin-sdk/protocol`): PostgreSQL writes JSON looser.
    check('plugin_records_data_size', sql`octet_length(${table.data}::text) <= 32768`),
    // RECORD_SLOT_TEXT_MAX_LENGTH.
    ...RECORD_SLOTS.text.map((slot) =>
      check(`plugin_records_${slot}_length`, sql`char_length(${table[slot]}) <= 320`),
    ),
  ],
);
