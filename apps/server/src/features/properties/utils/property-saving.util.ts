import { type OptionsPlan, planOptions } from '@toppo/core';
import { isUniqueViolation, schema, uuidv7 } from '@toppo/db';
import {
  type CreatePropertyRequest,
  PROPERTIES_MAX,
  type PropertyOptionDraft,
} from '@toppo/shared';
import { and, asc, count, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { ofScope, takeOptionsOff } from './property-values.util.ts';

const { properties, propertyOptions } = schema;

/** Arbitrary but fixed: two properties created at once are counted one after the other. */
const PROPERTIES_LOCK_KEY = 7_461_756_331;

const nameTaken = () => new HttpError(409, 'PROPERTY_NAME_TAKEN', 'Another property has this name');

/**
 * Refuses a name another property has where it would show: a property of the instance shows in
 * every project, so its name is taken by any; one of a project shares its issues with the
 * instance's and its own others.
 */
export async function assertNameFree(
  tx: Transaction,
  name: string,
  { projectId, exceptId }: { projectId: string | null; exceptId?: string },
): Promise<void> {
  const sameName = sql`lower(${properties.name}) = lower(${name})`;
  const [taken] = await tx
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        sameName,
        exceptId === undefined ? undefined : ne(properties.id, exceptId),
        projectId === null
          ? undefined
          : or(isNull(properties.projectId), eq(properties.projectId, projectId)),
      ),
    )
    .limit(1);
  if (taken) {
    throw nameTaken();
  }
}

/**
 * Adds a property to the instance or to one project, with its options in their order, at most
 * PROPERTIES_MAX in each. Answers its id.
 */
export async function insertProperty(
  tx: Transaction,
  projectId: string | null,
  { options, ...fields }: CreatePropertyRequest,
): Promise<string> {
  await tx.execute(sql`select pg_advisory_xact_lock(${PROPERTIES_LOCK_KEY})`);
  const [existing] = await tx.select({ count: count() }).from(properties).where(ofScope(projectId));
  if ((existing?.count ?? 0) >= PROPERTIES_MAX) {
    throw new HttpError(
      409,
      'PROPERTY_LIMIT_REACHED',
      `At most ${PROPERTIES_MAX} properties can be defined here`,
    );
  }
  await assertNameFree(tx, fields.name, { projectId });
  const id = uuidv7();
  try {
    await tx.insert(properties).values({ id, projectId, ...fields });
  } catch (error) {
    if (
      isUniqueViolation(error, 'properties_instance_name_unique') ||
      isUniqueViolation(error, 'properties_project_name_unique')
    ) {
      throw nameTaken();
    }
    throw error;
  }
  await tx.insert(propertyOptions).values(
    options.map(({ name, color }, position) => ({
      id: uuidv7(),
      propertyId: id,
      name,
      color,
      position,
    })),
  );
  return id;
}

/** Saves a property's name and switches, its name checked first where it shows. */
export async function saveFields(
  tx: Transaction,
  propertyId: string,
  projectId: string | null,
  fields: { name: string; shownInList: boolean; askedAtCreation: boolean; required: boolean },
): Promise<void> {
  await assertNameFree(tx, fields.name, { projectId, exceptId: propertyId });
  try {
    await tx.update(properties).set(fields).where(eq(properties.id, propertyId));
  } catch (error) {
    if (
      isUniqueViolation(error, 'properties_instance_name_unique') ||
      isUniqueViolation(error, 'properties_project_name_unique')
    ) {
      throw nameTaken();
    }
    throw error;
  }
}

type Plan = OptionsPlan<Omit<PropertyOptionDraft, 'id'>>;

/**
 * Saves one list of options of a property at once: the instance's (or an own property's), with
 * `ownedBy` null, or a project's own ones. Those removed leave their issues, told in their
 * history. Answers how many issues lost one.
 */
export async function saveOptions(
  tx: Transaction,
  actorId: string,
  property: { id: string; name: string },
  ownedBy: string | null,
  requested: readonly PropertyOptionDraft[],
  removed: readonly string[],
): Promise<number> {
  const stored = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(and(eq(propertyOptions.propertyId, property.id), optionsOf(ownedBy)))
    .orderBy(asc(propertyOptions.position))
    .for('update');
  const plan = planOptions(
    stored.map(({ id }) => id),
    requested,
    removed,
  );
  if (!plan) {
    throw new HttpError(409, 'PROPERTY_CHANGED', 'The property changed meanwhile');
  }
  // Taken off under the names they had: their issues' history keeps them.
  const takenOff = await takeOptionsOff(
    tx,
    actorId,
    property,
    stored.filter(({ id }) => plan.removed.includes(id)),
    ownedBy === null ? {} : { projectId: ownedBy },
  );
  if (plan.removed.length > 0) {
    await tx.delete(propertyOptions).where(inArray(propertyOptions.id, plan.removed));
  }
  await keepAndAdd(tx, property.id, ownedBy, plan, stored);
  return takenOff;
}

/** The options of the instance (or of an own property), or a project's own. */
export function optionsOf(ownedBy: string | null) {
  return ownedBy === null
    ? isNull(propertyOptions.projectId)
    : eq(propertyOptions.projectId, ownedBy);
}

async function keepAndAdd(
  tx: Transaction,
  propertyId: string,
  ownedBy: string | null,
  { kept, added }: Plan,
  stored: readonly { id: string; name: string }[],
): Promise<void> {
  const renamed = kept.filter(
    ({ id, name }) => stored.find((option) => option.id === id)?.name !== name,
  );
  // Names are unique, checked row by row: the renamed options first give theirs up, so that two
  // of them can swap names, then take their new ones.
  if (renamed.length > 0) {
    await tx
      .update(propertyOptions)
      .set({ name: sql`${propertyOptions.id}::text` })
      .where(
        inArray(
          propertyOptions.id,
          renamed.map(({ id }) => id),
        ),
      );
  }
  try {
    for (const { id, name, color, position } of kept) {
      await tx
        .update(propertyOptions)
        .set({ name, color, position })
        .where(eq(propertyOptions.id, id));
    }
    if (added.length > 0) {
      await tx.insert(propertyOptions).values(
        added.map(({ name, color, position }) => ({
          id: uuidv7(),
          propertyId,
          projectId: ownedBy,
          name,
          color,
          position,
        })),
      );
    }
  } catch (error) {
    // The forms compare names in lower case as JavaScript does; PostgreSQL has the last word.
    if (
      isUniqueViolation(error, 'property_options_instance_name_unique') ||
      isUniqueViolation(error, 'property_options_project_name_unique')
    ) {
      throw new HttpError(409, 'OPTION_NAME_TAKEN', 'Two options would share a name');
    }
    throw error;
  }
}

/**
 * Deletes a property: its values, of every option it has anywhere, leave their issues, each told
 * in its history; its options and the projects' adaptations go with it. Answers how many issues
 * lost one.
 */
export async function deleteWithValues(
  tx: Transaction,
  actorId: string,
  property: { id: string; name: string },
): Promise<number> {
  const options = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(eq(propertyOptions.propertyId, property.id))
    .for('update');
  const takenOff = await takeOptionsOff(tx, actorId, property, options);
  await tx.delete(properties).where(eq(properties.id, property.id));
  return takenOff;
}
