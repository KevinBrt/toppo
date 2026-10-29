import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../auth.ts';
import { id, timestamps } from '../columns.ts';
import { projects } from '../projects.ts';

/**
 * An address told of what happens on issues, by a signed `POST` (Standard Webhooks), as the
 * administrator of the instance set it: the events it hears of, in the projects chosen.
 */
export const webhooks = pgTable(
  'webhooks',
  {
    id: id(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** The key its requests are signed with, sealed by the instance's: shown once, as created. */
    secretSealed: text('secret_sealed').notNull(),
    events: text('events').array().notNull(),
    /** Told of every project, present and future; otherwise of `webhook_projects` only. */
    allProjects: boolean('all_projects').notNull().default(false),
    /** Its address may lie inside the network: a team's own server, as the administrator says. */
    allowPrivate: boolean('allow_private').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    /** Its deliveries given up in a row: past a few, it is stopped and the administrators told. */
    failures: integer('failures').notNull().default(0),
    lastError: text('last_error'),
    createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('webhooks_created_by_id_idx').on(table.createdById),
    check('webhooks_name_length', sql`char_length(${table.name}) between 1 and 80`),
    check(
      'webhooks_url_format',
      sql`${table.url} ~ '^https?://' and char_length(${table.url}) <= 2000`,
    ),
    check('webhooks_events_count', sql`cardinality(${table.events}) between 1 and 16`),
    // The plugins' events, so that one format serves both. Mirrors EVENT_TYPES
    // (`@toppo-tracker/plugin-sdk/protocol`), which a test compares.
    check(
      'webhooks_events_known',
      sql`${table.events} <@ array['issue.created', 'issue.deleted', 'issue.titleChanged', 'issue.descriptionChanged', 'issue.statusChanged', 'issue.categoryChanged', 'issue.priorityChanged', 'issue.assigneeChanged', 'issue.labelsChanged', 'issue.propertyChanged', 'issue.duplicateChanged', 'issue.commented', 'issue.commentEdited', 'issue.commentDeleted', 'issue.attachmentAdded', 'issue.attachmentRemoved']`,
    ),
    check('webhooks_failures_not_negative', sql`${table.failures} >= 0`),
    check('webhooks_last_error_length', sql`char_length(${table.lastError}) <= 2000`),
  ],
);

/** The projects a webhook is told of, unless it is told of all of them. */
export const webhookProjects = pgTable(
  'webhook_projects',
  {
    id: id(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('webhook_projects_webhook_project_unique').on(table.webhookId, table.projectId),
    index('webhook_projects_project_id_idx').on(table.projectId),
  ],
);

/**
 * A request sent, or to send, to a webhook: what it carries, kept to be sent again, and how it
 * went. Its last 50 kept, gone with it.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    /** `webhook-id`: the same when it is sent again, so that the receiver keeps it once. */
    messageId: uuid('message_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['pending', 'delivered', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    /** What the receiver answered, if it did. */
    responseStatus: integer('response_status'),
    /** Why it got no answer: an address refused, too slow, a redirect… */
    error: text('error'),
    durationMs: integer('duration_ms'),
    ...timestamps,
  },
  (table) => [
    // A webhook's latest first, and its foreign key.
    index('webhook_deliveries_webhook_id_created_at_idx').on(
      table.webhookId,
      table.createdAt.desc(),
    ),
    check(
      'webhook_deliveries_event_type_known',
      sql`${table.eventType} in ('webhook.test', 'issue.created', 'issue.deleted', 'issue.titleChanged', 'issue.descriptionChanged', 'issue.statusChanged', 'issue.categoryChanged', 'issue.priorityChanged', 'issue.assigneeChanged', 'issue.labelsChanged', 'issue.propertyChanged', 'issue.duplicateChanged', 'issue.commented', 'issue.commentEdited', 'issue.commentDeleted', 'issue.attachmentAdded', 'issue.attachmentRemoved')`,
    ),
    check('webhook_deliveries_payload_object', sql`jsonb_typeof(${table.payload}) = 'object'`),
    // Its largest, 1 MiB: a description changed (before, after, as it stands) at its longest,
    // each character escaped by JSON in six bytes.
    check('webhook_deliveries_payload_size', sql`octet_length(${table.payload}::text) <= 1048576`),
    check(
      'webhook_deliveries_status_check',
      sql`${table.status} in ('pending', 'delivered', 'failed')`,
    ),
    check('webhook_deliveries_attempts_not_negative', sql`${table.attempts} >= 0`),
    check(
      'webhook_deliveries_response_status_range',
      sql`${table.responseStatus} between 100 and 599`,
    ),
    // Mirrors the outbound guard's failures (`platform/http/outbound`).
    check(
      'webhook_deliveries_error_check',
      sql`${table.error} in ('ADDRESS_NOT_ALLOWED', 'TIMEOUT', 'RESPONSE_TOO_LARGE', 'TOO_MANY_REDIRECTS', 'NETWORK_ERROR', 'WEBHOOK_DISABLED', 'SECRET_UNREADABLE')`,
    ),
    check('webhook_deliveries_duration_not_negative', sql`${table.durationMs} >= 0`),
  ],
);
