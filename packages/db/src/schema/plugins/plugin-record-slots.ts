import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../columns.ts';
import type { RecordSlot } from './plugin-records.ts';

/**
 * Which slot of `plugin_records` holds each field an entity indexes. Kept from one version of the
 * plugin to the next while the field stays as declared, so that its slot stays filled; given
 * afresh otherwise, and filled by a job when records are already kept, read from their data
 * meanwhile. Named after the plugin's id, like its records, and kept or deleted with them.
 */
export const pluginRecordSlots = pgTable(
  'plugin_record_slots',
  {
    id: id(),
    pluginSlug: text('plugin_slug').notNull(),
    entity: text('entity').notNull(),
    field: text('field').notNull(),
    slot: text('slot').$type<RecordSlot>().notNull(),
    /** The field as the plugin declared it when given the slot, in JSON Schema. */
    declared: jsonb('declared').$type<Record<string, unknown>>().notNull(),
    /** Since when every record has its field copied there; `null` while a job fills it. */
    filledAt: timestamp('filled_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('plugin_record_slots_field_unique').on(table.pluginSlug, table.entity, table.field),
    uniqueIndex('plugin_record_slots_slot_unique').on(table.pluginSlug, table.entity, table.slot),
    // Mirrors PLUGIN_ID and ENTITY_NAME (`@toppo-tracker/plugin-sdk/protocol`), and RECORD_SLOTS.
    check(
      'plugin_record_slots_plugin_slug_format',
      sql`${table.pluginSlug} ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'`,
    ),
    check('plugin_record_slots_entity_format', sql`${table.entity} ~ '^[a-z][A-Za-z0-9]{0,39}$'`),
    check('plugin_record_slots_field_format', sql`${table.field} ~ '^[a-z][A-Za-z0-9]{0,39}$'`),
    check(
      'plugin_record_slots_slot_name',
      sql`${table.slot} ~ '^(date[1-3]|number[1-3]|text[1-3]|ref[1-2])$'`,
    ),
    check('plugin_record_slots_declared_object', sql`jsonb_typeof(${table.declared}) = 'object'`),
    check('plugin_record_slots_declared_size', sql`octet_length(${table.declared}::text) <= 32768`),
  ],
);
