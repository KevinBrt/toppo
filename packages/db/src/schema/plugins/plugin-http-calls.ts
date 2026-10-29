import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, timestamps } from '../columns.ts';
import { plugins } from './plugins.ts';

/**
 * The last calls a plugin made outside Toppo, shown on its page: where to, and how each went.
 * Never their path, query or body, which may carry a secret. Its last 50 kept, gone with it.
 */
export const pluginHttpCalls = pgTable(
  'plugin_http_calls',
  {
    id: id(),
    pluginId: uuid('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    method: text('method').notNull(),
    /** `hooks.slack.com`, with its port unless the scheme's own. */
    host: text('host').notNull(),
    /** What the server answered; `null` when the call did not get an answer. */
    status: integer('status'),
    /** Why it got no answer: refused by Toppo, too slow, too large… */
    error: text('error'),
    durationMs: integer('duration_ms').notNull(),
    ...timestamps,
  },
  (table) => [
    // A plugin's latest first, and its foreign key.
    index('plugin_http_calls_plugin_id_created_at_idx').on(table.pluginId, table.createdAt.desc()),
    // Mirrors HTTP_METHODS (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugin_http_calls_method_check',
      sql`${table.method} in ('GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE')`,
    ),
    check('plugin_http_calls_host_length', sql`char_length(${table.host}) between 1 and 260`),
    check('plugin_http_calls_status_range', sql`${table.status} between 100 and 599`),
    // Mirrors HTTP_FAILURES (`@toppo-tracker/plugin-sdk/protocol`).
    check(
      'plugin_http_calls_error_check',
      sql`${table.error} in ('HOST_NOT_DECLARED', 'ADDRESS_NOT_ALLOWED', 'TOO_MANY_CALLS', 'TIMEOUT', 'RESPONSE_TOO_LARGE', 'TOO_MANY_REDIRECTS', 'NETWORK_ERROR')`,
    ),
    check(
      'plugin_http_calls_answered_or_not',
      sql`(${table.status} is null) <> (${table.error} is null)`,
    ),
    check('plugin_http_calls_duration_not_negative', sql`${table.durationMs} >= 0`),
  ],
);
