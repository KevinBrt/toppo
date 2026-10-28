import { ROLE_COLORS } from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';

/**
 * A role is a named set of permissions. A member holds one for the whole instance
 * (`users.instance_role_id`); a project may give them another. Code checks permissions, never
 * role names.
 */
export const roles = pgTable(
  'roles',
  {
    id: id(),
    name: text('name').notNull(),
    /** The system role: every permission, now and to come; it cannot be edited or deleted. */
    grantsAll: boolean('grants_all').notNull().default(false),
    color: text('color', { enum: ROLE_COLORS }).notNull().default('gray'),
    /** By catalog name: Toppo's (`issue.read`) and plugins' (`time-tracking.entries.log`). */
    permissions: text('permissions').array().$type<string[]>().notNull().default(sql`'{}'::text[]`),
    /** Its members are told of every new issue they may see: a setting, not a permission. */
    notifyNewIssues: boolean('notify_new_issues').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    check('roles_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'roles_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    uniqueIndex('roles_name_unique').on(sql`lower(${table.name})`),
    uniqueIndex('roles_single_grants_all').on(table.grantsAll).where(sql`${table.grantsAll}`),
  ],
);
