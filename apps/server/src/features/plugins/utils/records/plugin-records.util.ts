import { type Db, schema } from '@toppo-tracker/db';
import {
  type EntityDeclaration,
  manifestSchema,
  RECORD_MAX_BYTES,
  type RecordData,
  recordFieldsSchemaOf,
} from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { Actor, PluginReach } from '../../../../platform/auth/actor.ts';
import { grantedIn, reachableBy } from '../../../../platform/auth/project-access.ts';
import type { Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { issues, pluginRecords, plugins, projects } = schema;

/** The plugin an actor is: records are a plugin's own, read and written by it only. */
export function pluginOf(actor: Actor): PluginReach {
  if (!actor.plugin) {
    throw new HttpError(403, 'FORBIDDEN', 'A plugin reads and writes its own records');
  }
  return actor.plugin;
}

/** The entity `name` of the plugin, as its manifest declares it. */
export async function entityOf(
  db: Pick<Db, 'select'>,
  plugin: PluginReach,
  name: string,
): Promise<EntityDeclaration> {
  const [row] = await db
    .select({ manifest: plugins.manifest })
    .from(plugins)
    .where(eq(plugins.slug, plugin.slug));
  // Checked as it was installed: a manifest Toppo kept is one it accepted.
  const entities = row ? manifestSchema.parse(row.manifest).entities : {};
  const entity = Object.hasOwn(entities, name) ? entities[name] : undefined;
  if (!entity) {
    throw new HttpError(404, 'ENTITY_NOT_FOUND', `The plugin keeps no ${name}`);
  }
  return entity;
}

/**
 * A record's fields as Toppo checks them itself, from what the entity declares and never from
 * the plugin's code: defaults applied, within their size.
 */
export function checkedFields(
  entity: EntityDeclaration,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const checked = recordFieldsSchemaOf(entity.fields).safeParse(fields);
  if (!checked.success) {
    throw new HttpError(400, 'RECORD_INVALID', 'Toppo refuses these fields', {
      details: checked.error.issues.slice(0, 50).map((issue) => ({
        path: issue.path.join('.').slice(0, 200),
        message: issue.message.slice(0, 500),
      })),
    });
  }
  if (new TextEncoder().encode(JSON.stringify(checked.data)).length > RECORD_MAX_BYTES) {
    throw new HttpError(400, 'RECORD_INVALID', `A record weighs ${RECORD_MAX_BYTES} bytes at most`);
  }
  return checked.data;
}

/**
 * The records of `entity` the actor sees, as a condition on `plugin_records` joined to its
 * project and, left, to its issue: the plugin's own, in the projects it acts in; acting for
 * someone, those they see too, as they see their issue or project.
 */
export function visibleRecords(
  plugin: PluginReach,
  entity: string,
  attachedTo: EntityDeclaration['attachedTo'],
): SQL {
  const own = and(eq(pluginRecords.pluginSlug, plugin.slug), eq(pluginRecords.entity, entity));
  const reached = plugin.allProjects
    ? sql`true`
    : inArray(pluginRecords.projectId, [...plugin.projectIds]);
  const person = plugin.onBehalfOf;
  if (!person) {
    return and(own, reached) ?? sql`false`;
  }
  const seen =
    attachedTo === 'issue'
      ? or(
          grantedIn(person.id, ['issue.read']),
          and(eq(issues.reporterId, person.id), grantedIn(person.id, ['issue.read.own'])),
        )
      : reachableBy(person.id);
  return and(own, reached, seen) ?? sql`false`;
}

/** The records the plugin asks for: on an issue, in a project, written by someone. */
export function recordsWhere(where: {
  issueId?: string | undefined;
  projectId?: string | undefined;
  createdBy?: string | undefined;
}): SQL | undefined {
  return and(
    where.issueId === undefined ? undefined : eq(pluginRecords.issueId, where.issueId),
    where.projectId === undefined ? undefined : eq(pluginRecords.projectId, where.projectId),
    where.createdBy === undefined ? undefined : eq(pluginRecords.createdById, where.createdBy),
  );
}

/** Who a record is written by: whoever the plugin acts for, or its own user. */
export function authorOf(actor: Actor): string {
  return actor.plugin?.onBehalfOf?.id ?? actor.id;
}

/** The columns of a record, as the plugin reads it. */
export const RECORD_COLUMNS = {
  id: pluginRecords.id,
  issueId: pluginRecords.issueId,
  projectId: pluginRecords.projectId,
  createdBy: pluginRecords.createdById,
  createdAt: pluginRecords.createdAt,
  updatedAt: pluginRecords.updatedAt,
  fields: pluginRecords.data,
} as const;

export function recordOf(row: {
  id: string;
  issueId: string | null;
  projectId: string;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  fields: Record<string, unknown>;
}): RecordData {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export function recordNotFound(): HttpError {
  return new HttpError(404, 'RECORD_NOT_FOUND', 'This record does not exist');
}

/**
 * A record the actor sees, locked to be changed: its fields as kept. Refused in an archived
 * project, read-only as it is.
 */
export async function recordToChange(
  tx: Transaction,
  plugin: PluginReach,
  name: string,
  entity: EntityDeclaration,
  id: string,
): Promise<{ fields: Record<string, unknown> }> {
  const [record] = await tx
    .select({ fields: pluginRecords.data, archivedAt: projects.archivedAt })
    .from(pluginRecords)
    .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
    .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
    .where(and(eq(pluginRecords.id, id), visibleRecords(plugin, name, entity.attachedTo)))
    .for('update', { of: pluginRecords });
  if (!record) {
    throw recordNotFound();
  }
  if (record.archivedAt !== null) {
    throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived: it is read-only');
  }
  return { fields: record.fields };
}
