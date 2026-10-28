import { type Db, schema } from '@toppo-tracker/db';
import {
  ENTITY_LIMITS,
  type EntityDeclaration,
  HOST_CALLS,
} from '@toppo-tracker/plugin-sdk/protocol';
import { and, count, eq, isNull, sql } from 'drizzle-orm';
import type { Actor } from '../../../../platform/auth/actor.ts';
import {
  issueKeyOf,
  projectKeyOf,
  resolveIssue,
  resolveProject,
} from '../../../../platform/auth/project-access.ts';
import { defineCommand, type Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import {
  authorOf,
  checkedFields,
  entityOf,
  pluginOf,
} from '../../utils/records/plugin-records.util.ts';

const { pluginRecords } = schema;

/** Where a new record hangs, as the plugin, and whoever it acts for, reaches it. */
interface Anchor {
  projectId: string;
  issueId: string | null;
  archived: boolean;
}

/**
 * Keeps a record of one of the plugin's entities, on an issue or a project it, and whoever it
 * acts for, sees: its fields checked by Toppo as the entity declares them, within its limits.
 * Answers its id; the plugin reads it back as it reads any record.
 */
export const createRecord = defineCommand({
  name: 'plugin.createRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.create'].args,
  async handler(
    { tx, actor },
    { entity: name, issueId, projectId, fields },
  ): Promise<{ id: string }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(tx, plugin, name);
    const anchor = await anchorOf(tx, actor, name, entity, { issueId, projectId });
    if (anchor.archived) {
      throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived: it is read-only');
    }
    const data = checkedFields(entity, fields);
    await assertRoom(tx, { plugin: plugin.slug, name, entity }, anchor);
    const [created] = await tx
      .insert(pluginRecords)
      .values({
        pluginSlug: plugin.slug,
        entity: name,
        projectId: anchor.projectId,
        issueId: anchor.issueId,
        createdById: authorOf(actor),
        data,
      })
      .returning({ id: pluginRecords.id });
    if (!created) {
      throw new Error('The record was not kept');
    }
    return created;
  },
});

async function anchorOf(
  db: Db | Transaction,
  actor: Actor,
  name: string,
  entity: EntityDeclaration,
  given: { issueId?: string | undefined; projectId?: string | undefined },
): Promise<Anchor> {
  if (entity.attachedTo === 'issue') {
    if (given.issueId === undefined || given.projectId !== undefined) {
      throw new HttpError(400, 'RECORD_INVALID', `${name} hangs on an issue: give its issueId`);
    }
    const issueKey = await issueKeyOf(db, given.issueId);
    const project = await resolveIssue(db, actor, issueKey ?? undefined);
    return { projectId: project.id, issueId: project.issue.id, archived: project.archived };
  }
  if (given.projectId === undefined || given.issueId !== undefined) {
    throw new HttpError(400, 'RECORD_INVALID', `${name} hangs on a project: give its projectId`);
  }
  const project = await resolveProject(db, actor, await projectKeyOf(db, given.projectId));
  return { projectId: project.id, issueId: null, archived: project.archived };
}

/**
 * Refuses a record past its entity's limit: by issue for those on issues, by project for those
 * on a project only. Records of one anchor are counted one write at a time.
 */
async function assertRoom(
  tx: Transaction,
  { plugin, name, entity }: { plugin: string; name: string; entity: EntityDeclaration },
  anchor: Anchor,
): Promise<void> {
  const lock = `${plugin}:${name}:${anchor.issueId ?? anchor.projectId}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
  const limit =
    anchor.issueId === null
      ? (entity.limits.perProject ?? ENTITY_LIMITS.perProject.default)
      : (entity.limits.perIssue ?? ENTITY_LIMITS.perIssue.default);
  const [held] = await tx
    .select({ count: count() })
    .from(pluginRecords)
    .where(
      and(
        eq(pluginRecords.pluginSlug, plugin),
        eq(pluginRecords.entity, name),
        anchor.issueId === null
          ? and(eq(pluginRecords.projectId, anchor.projectId), isNull(pluginRecords.issueId))
          : eq(pluginRecords.issueId, anchor.issueId),
      ),
    );
  if ((held?.count ?? 0) >= limit) {
    throw new HttpError(
      409,
      'RECORD_LIMIT_REACHED',
      `At most ${limit} of these records ${anchor.issueId === null ? 'in a project' : 'on an issue'}`,
    );
  }
}
