import { PALETTE_COLORS, WORKFLOW_MODES } from '@toppo-tracker/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.ts';
import { projects } from './projects.ts';

/**
 * The statuses issues move through: a catalog the workflows share. A project's copy of the
 * instance's workflow reuses its rows, so customizing moves no issue; a status added to a copy
 * belongs to its project.
 */
export const statuses = pgTable(
  'statuses',
  {
    id: id(),
    name: text('name').notNull(),
    /** Issues on it are closed (`closed_at` set). */
    closes: boolean('closes').notNull().default(false),
    color: text('color', { enum: PALETTE_COLORS }).notNull().default('gray'),
    /** Null for the instance's statuses. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    check('statuses_name_not_blank', sql`btrim(${table.name}) <> ''`),
    check(
      'statuses_color_check',
      sql`${table.color} in ('gray', 'blue', 'green', 'amber', 'violet', 'cyan', 'orange', 'pink')`,
    ),
    // Two statuses of the same scope (the instance, or one project) never share a name.
    uniqueIndex('statuses_name_unique').on(
      sql`coalesce(${table.projectId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${table.name})`,
    ),
    index('statuses_project_id_idx').on(table.projectId),
  ],
);

/** The instance's workflow, which projects follow, and the copies some projects made their own. */
export const workflows = pgTable(
  'workflows',
  {
    id: id(),
    /** Null for the instance's workflow. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** `free`: any status may follow any other; its transitions wait for it to be defined again. */
    mode: text('mode', { enum: WORKFLOW_MODES }).notNull().default('defined'),
    ...timestamps,
  },
  (table) => [
    // One workflow for the instance, and at most one copy per project.
    unique('workflows_project_unique').on(table.projectId).nullsNotDistinct(),
    check('workflows_mode_check', sql`${table.mode} in ('defined', 'free')`),
  ],
);

/** The statuses of a workflow, in order. Which one may follow which is in `workflow_transitions`. */
export const workflowStatuses = pgTable(
  'workflow_statuses',
  {
    id: id(),
    workflowId: uuid('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    /** A status still in a workflow cannot be deleted. */
    statusId: uuid('status_id')
      .notNull()
      .references(() => statuses.id, { onDelete: 'restrict' }),
    position: integer('position').notNull(),
    /** Where new issues start: exactly one per workflow. */
    isInitial: boolean('is_initial').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    unique('workflow_statuses_workflow_status_unique').on(table.workflowId, table.statusId),
    uniqueIndex('workflow_statuses_single_initial')
      .on(table.workflowId)
      .where(sql`${table.isInitial}`),
    index('workflow_statuses_status_id_idx').on(table.statusId),
    check('workflow_statuses_position_check', sql`${table.position} >= 0`),
  ],
);

/**
 * The statuses an issue may move to from another, in one workflow: people change an issue's
 * status, the workflow says which moves are possible. Both ends belong to the workflow (composite
 * foreign keys): taking a status out of it takes its transitions too.
 */
export const workflowTransitions = pgTable(
  'workflow_transitions',
  {
    id: id(),
    workflowId: uuid('workflow_id').notNull(),
    fromStatusId: uuid('from_status_id').notNull(),
    toStatusId: uuid('to_status_id').notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      name: 'workflow_transitions_from_fk',
      columns: [table.workflowId, table.fromStatusId],
      foreignColumns: [workflowStatuses.workflowId, workflowStatuses.statusId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'workflow_transitions_to_fk',
      columns: [table.workflowId, table.toStatusId],
      foreignColumns: [workflowStatuses.workflowId, workflowStatuses.statusId],
    }).onDelete('cascade'),
    unique('workflow_transitions_unique').on(
      table.workflowId,
      table.fromStatusId,
      table.toStatusId,
    ),
    index('workflow_transitions_to_idx').on(table.workflowId, table.toStatusId),
    check('workflow_transitions_not_to_itself', sql`${table.fromStatusId} <> ${table.toStatusId}`),
  ],
);
