import { MAIL_SECURITY } from '@toppo/shared';
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { timestamps } from './columns.ts';

/** Settings of the instance, as a single row (id 1) created by the first migration. */
export const instanceSettings = pgTable(
  'instance_settings',
  {
    id: smallint('id').primaryKey().default(1),
    /** Set once the first-run wizard has created the first administrator. */
    setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [check('instance_settings_single_row', sql`${table.id} = 1`)],
);

export const INSTANCE_SETTINGS_ID = 1;

/**
 * How the instance sends email, as a single row (id 1): none while email is not set up. The
 * password is sealed with the instance's key, so that a copy of the database alone does not
 * reveal it.
 */
export const mailSettings = pgTable(
  'mail_settings',
  {
    id: smallint('id').primaryKey().default(1),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    security: text('security', { enum: MAIL_SECURITY }).notNull(),
    username: text('username'),
    passwordSealed: text('password_sealed'),
    fromAddress: text('from_address').notNull(),
    fromName: text('from_name').notNull(),
    ...timestamps,
  },
  (table) => [
    check('mail_settings_single_row', sql`${table.id} = 1`),
    check('mail_settings_port_range', sql`${table.port} between 1 and 65535`),
    // Mirrors MAIL_SECURITY (`@toppo/shared`).
    check('mail_settings_security_check', sql`${table.security} in ('starttls', 'tls', 'none')`),
    // Signing in takes both, or neither.
    check(
      'mail_settings_credentials_together',
      sql`(${table.username} is null) = (${table.passwordSealed} is null)`,
    ),
  ],
);
