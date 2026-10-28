import { PALETTE_COLORS } from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './auth.ts';
import { id, timestamps } from './columns.ts';
import { roles } from './roles.ts';

/** A project groups issues under a short key: `WEB` in `WEB-42`. */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    /** Fixed once the project's first issue exists: no key already passed on breaks. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    /** Shown with the project's initials; given in turn from the palette at creation. */
    color: text('color', { enum: PALETTE_COLORS }).notNull().default('gray'),
    /** Set while the project is archived: read-only. */
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    /**
     * The number the next issue gets. Incremented by the creating transaction, which locks the
     * row: two issues never share a number, and a deleted issue's number is never reused.
     */
    nextIssueNumber: integer('next_issue_number').notNull().default(1),
    /**
     * How the project adapts the issues' category and priority: hidden from its forms, list and
     * issues (they keep the default), or asked at creation without a default chosen.
     */
    categoryHidden: boolean('category_hidden').notNull().default(false),
    categoryRequired: boolean('category_required').notNull().default(false),
    priorityHidden: boolean('priority_hidden').notNull().default(false),
    priorityRequired: boolean('priority_required').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('projects_key_unique').on(table.key),
    // Mirrors PROJECT_KEY_PATTERN (`@toppo-tracker/shared`).
    check('projects_key_format', sql`${table.key} ~ '^[A-Z][A-Z0-9]{1,9}$'`),
    check('projects_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'projects_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    check('projects_next_issue_number_positive', sql`${table.nextIssueNumber} >= 1`),
    check(
      'projects_category_hidden_or_required',
      sql`not (${table.categoryHidden} and ${table.categoryRequired})`,
    ),
    check(
      'projects_priority_hidden_or_required',
      sql`not (${table.priorityHidden} and ${table.priorityRequired})`,
    ),
  ],
);

/**
 * Who has access to a project besides the system role and members given every project
 * (`users.all_projects`), and the role a member has there when it is not their own.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    id: id(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The member's role in this project; null: their own role. A role given here cannot be deleted. */
    roleId: uuid('role_id').references(() => roles.id, { onDelete: 'restrict' }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('project_members_project_user_unique').on(table.projectId, table.userId),
    index('project_members_user_id_idx').on(table.userId),
    index('project_members_role_id_idx').on(table.roleId),
  ],
);
