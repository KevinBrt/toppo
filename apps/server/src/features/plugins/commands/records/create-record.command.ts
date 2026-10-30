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
import { pluginPersonOf } from '../../utils/people/plugin-people.util.ts';
import {
  authorOf,
  checkedFields,
  entityOf,
  pluginOf,
} from '../../utils/records/plugin-records.util.ts';
import { slotsToWrite, slotWritesOf } from '../../utils/records/record-slots.util.ts';

const { pluginRecords } = schema;

/** Where a new record hangs, as the plugin, and whoever it acts for, reaches it. */
type Anchor =
  | { projectId: string; issueId: string | null; personId: null; archived: boolean }
  | { projectId: null; issueId: null; personId: string; archived: false };

/** What a new record is said to hang on: one of these, as its entity says. */
interface GivenAnchor {
  issueId?: string | undefined;
  projectId?: string | undefined;
  personId?: string | undefined;
}

/**
 * Keeps a record of one of the plugin's entities, on an issue or a project it, and whoever it
 * acts for, sees, or on one of its people (acting for someone, that person only): its fields
 * checked by Toppo as the entity declares them, within its limits, those it indexes copied to
 * their slots. Answers its id; the plugin reads it back as it reads any record.
 */
export const createRecord = defineCommand({
  name: 'plugin.createRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.create'].args,
  async handler(
    { tx, actor },
    { entity: name, issueId, projectId, personId, fields },
  ): Promise<{ id: string }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(tx, plugin, name);
    const anchor = await anchorOf(tx, actor, name, entity, { issueId, projectId, personId });
    if (anchor.archived) {
      throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived: it is read-only');
    }
    const data = checkedFields(entity, fields);
    const indexed = await slotsToWrite(tx, plugin.slug, name, entity);
    await assertRoom(tx, { plugin: plugin.slug, name, entity }, anchor);
    const [created] = await tx
      .insert(pluginRecords)
      .values({
        pluginSlug: plugin.slug,
        entity: name,
        projectId: anchor.projectId,
        issueId: anchor.issueId,
        personId: anchor.personId,
        createdById: authorOf(actor),
        data,
        ...slotWritesOf(indexed, data),
      })
      .returning({ id: pluginRecords.id });
    if (!created) {
      throw new Error('The record was not kept');
    }
    return created;
  },
});

/** The one anchor an entity's records take: given alone, or refused. */
const ANCHOR_OF = {
  issue: 'issueId',
  project: 'projectId',
  person: 'personId',
} as const satisfies Record<EntityDeclaration['attachedTo'], keyof GivenAnchor>;

async function anchorOf(
  db: Db | Transaction,
  actor: Actor,
  name: string,
  entity: EntityDeclaration,
  given: GivenAnchor,
): Promise<Anchor> {
  const anchor = ANCHOR_OF[entity.attachedTo];
  const id = given[anchor];
  const others = Object.values(ANCHOR_OF).filter((other) => other !== anchor);
  if (id === undefined || others.some((other) => given[other] !== undefined)) {
    throw new HttpError(
      400,
      'RECORD_INVALID',
      `${name} hangs on ${entity.attachedTo === 'issue' ? 'an' : 'a'} ${entity.attachedTo}: give its ${anchor}`,
    );
  }
  if (entity.attachedTo === 'person') {
    const personId = await pluginPersonOf(db, pluginOf(actor), id);
    return { projectId: null, issueId: null, personId, archived: false };
  }
  if (entity.attachedTo === 'issue') {
    const issueKey = await issueKeyOf(db, id);
    const project = await resolveIssue(db, actor, issueKey ?? undefined);
    return {
      projectId: project.id,
      issueId: project.issue.id,
      personId: null,
      archived: project.archived,
    };
  }
  const project = await resolveProject(db, actor, await projectKeyOf(db, id));
  return { projectId: project.id, issueId: null, personId: null, archived: project.archived };
}

/** The records an anchor holds, and the most it may: as the entity's limit of its kind says. */
function boundOf(anchor: Anchor, entity: EntityDeclaration) {
  if (anchor.personId !== null) {
    return {
      key: anchor.personId,
      held: eq(pluginRecords.personId, anchor.personId),
      limit: entity.limits.perPerson ?? ENTITY_LIMITS.perPerson.default,
      where: 'on a person',
    };
  }
  if (anchor.issueId !== null) {
    return {
      key: anchor.issueId,
      held: eq(pluginRecords.issueId, anchor.issueId),
      limit: entity.limits.perIssue ?? ENTITY_LIMITS.perIssue.default,
      where: 'on an issue',
    };
  }
  return {
    key: anchor.projectId,
    held: and(eq(pluginRecords.projectId, anchor.projectId), isNull(pluginRecords.issueId)),
    limit: entity.limits.perProject ?? ENTITY_LIMITS.perProject.default,
    where: 'in a project',
  };
}

/**
 * Refuses a record past its entity's limit: by issue for those on issues, by project for those
 * on a project only, by person for those on a person. Records of one anchor are counted one
 * write at a time.
 */
async function assertRoom(
  tx: Transaction,
  { plugin, name, entity }: { plugin: string; name: string; entity: EntityDeclaration },
  anchor: Anchor,
): Promise<void> {
  const bound = boundOf(anchor, entity);
  const lock = `${plugin}:${name}:${bound.key}`;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
  const [held] = await tx
    .select({ count: count() })
    .from(pluginRecords)
    .where(and(eq(pluginRecords.pluginSlug, plugin), eq(pluginRecords.entity, name), bound.held));
  if ((held?.count ?? 0) >= bound.limit) {
    throw new HttpError(
      409,
      'RECORD_LIMIT_REACHED',
      `At most ${bound.limit} of these records ${bound.where}`,
    );
  }
}
