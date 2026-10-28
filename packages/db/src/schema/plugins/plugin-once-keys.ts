import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../columns.ts';

/**
 * The keys that make a plugin's writes single (`{ once: event.id }`): an event handled twice, its
 * job run again after a server stopped, writes once. Written in the transaction of the write, and
 * swept once a week old, far past any retry.
 */
export const pluginOnceKeys = pgTable(
  'plugin_once_keys',
  {
    id: id(),
    /** As its user is named after it: a plugin reinstalled finds its keys again. */
    pluginSlug: text('plugin_slug').notNull(),
    /** The call that wrote: `issues.comment`. The same key may serve several of them. */
    method: text('method').notNull(),
    key: text('key').notNull(),
    /** What the write answered, answered again: `{ "commentId": "…" }`. */
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('plugin_once_keys_unique').on(table.pluginSlug, table.method, table.key),
    index('plugin_once_keys_created_at_idx').on(table.createdAt),
    // Mirrors PLUGIN_ID (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugin_once_keys_plugin_slug_format',
      sql`${table.pluginSlug} ~ '^[a-z][a-z0-9-]{1,38}[a-z0-9]$'`,
    ),
    check('plugin_once_keys_method_length', sql`char_length(${table.method}) between 1 and 100`),
    // Mirrors the `once` of HOST_CALLS (`@toppo-tracker/plugin-sdk/protocol`).
    check('plugin_once_keys_key_length', sql`char_length(${table.key}) between 1 and 200`),
  ],
);
