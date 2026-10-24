import { propertyChangeOf, withOptionsMoved, withoutOptions } from '@toppo/core';
import { schema } from '@toppo/db';
import type { PropertyType, PropertyValue } from '@toppo/shared';
import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { recordActivities } from '../../../platform/activities/record-activity.ts';
import type { Transaction } from '../../../platform/cqrs/cqrs.ts';

const { issues, properties, propertyOptions } = schema;

/** Rows written at once: far below PostgreSQL's limit of parameters per statement. */
const BATCH = 1000;

/** A property as its values are rewritten and told: what it is called, what it holds. */
export interface PropertyRef {
  id: string;
  name: string;
  type: PropertyType;
}

/** What an issue had of a property, and has once rewritten (`null`: no value any more). */
interface Rewritten {
  id: string;
  projectId: string;
  from: PropertyValue;
  to: PropertyValue | null;
}

/** The value an issue has of a property, as stored. */
const storedValue = (propertyId: string) =>
  sql<PropertyValue>`${issues.properties} -> ${propertyId}::text`;

/** Issues choosing any of these options of a property, found through the index of the values. */
function choosingAny(property: PropertyRef, optionIds: readonly string[]): SQL | undefined {
  return or(
    ...optionIds.map((id) => {
      const chosen = { [property.id]: property.type === 'multiSelect' ? [id] : id };
      return sql`${issues.properties} @> ${JSON.stringify(chosen)}::jsonb`;
    }),
  );
}

/** Issues having a value of a property, found through the index of the values. */
function havingValue(propertyId: string): SQL {
  return sql`${issues.properties} @? ${`$."${propertyId}"`}::jsonpath`;
}

/**
 * Rewrites the value of a property on the issues `where` finds, locked: each takes what `rewrite`
 * makes of it, or loses it with `null`. Issues given the same value are written together;
 * `touched`, they read as changed. Answers what each had and has.
 */
async function rewriteValues(
  tx: Transaction,
  propertyId: string,
  where: SQL | undefined,
  rewrite: (value: PropertyValue) => PropertyValue | null,
  { touched }: { touched: boolean },
): Promise<Rewritten[]> {
  const found = await tx
    .select({ id: issues.id, projectId: issues.projectId, value: storedValue(propertyId) })
    .from(issues)
    .where(where)
    .for('update');
  const rewritten = found.map(({ id, projectId, value }) => ({
    id,
    projectId,
    from: value,
    to: rewrite(value),
  }));
  const byValue = new Map<string, { to: PropertyValue | null; ids: string[] }>();
  for (const { id, to } of rewritten) {
    const key = JSON.stringify(to);
    byValue.set(key, { to, ids: [...(byValue.get(key)?.ids ?? []), id] });
  }
  for (const { to, ids } of byValue.values()) {
    const values =
      to === null
        ? sql`${issues.properties} - ${propertyId}::text`
        : sql`jsonb_set(${issues.properties}, array[${propertyId}::text], ${JSON.stringify(to)}::jsonb)`;
    for (let start = 0; start < ids.length; start += BATCH) {
      await tx
        .update(issues)
        .set(touched ? { properties: values, updatedAt: sql`now()` } : { properties: values })
        .where(inArray(issues.id, ids.slice(start, start + BATCH)));
    }
  }
  return rewritten;
}

/** The names of every option of a property, wherever they belong, before any of them goes. */
async function optionNamesOf(tx: Transaction, propertyId: string): Promise<Map<string, string>> {
  const options = await tx
    .select({ id: propertyOptions.id, name: propertyOptions.name })
    .from(propertyOptions)
    .where(eq(propertyOptions.propertyId, propertyId));
  return new Map(options.map(({ id, name }) => [id, name]));
}

/**
 * Records on each issue rewritten the change of its value, the options by their names now:
 * told to nobody, someone tidying the properties.
 */
async function recordChanges(
  tx: Transaction,
  actorId: string,
  property: PropertyRef,
  rewritten: readonly Rewritten[],
): Promise<void> {
  if (rewritten.length === 0) {
    return;
  }
  const names = await optionNamesOf(tx, property.id);
  const ref = { id: property.id, name: property.name, type: property.type };
  for (let start = 0; start < rewritten.length; start += BATCH) {
    await recordActivities(
      tx,
      rewritten.slice(start, start + BATCH).map(({ id, projectId, from, to }) => ({
        projectId,
        issueId: id,
        actorId,
        type: 'issue.propertyChanged' as const,
        payload: propertyChangeOf(ref, from, to, names),
      })),
      { notify: false },
    );
  }
}

/**
 * Takes options of a property off the issues choosing them, of one project or of every one,
 * before the options go: a list loses its value, a multi-select keeps its other options. Each
 * issue is told in its history, which keeps the names. Answers how many issues changed.
 */
export async function takeOptionsOff(
  tx: Transaction,
  actorId: string,
  property: PropertyRef,
  options: readonly { id: string; name: string }[],
  { projectId }: { projectId?: string } = {},
): Promise<number> {
  if (options.length === 0) {
    return 0;
  }
  const removed = options.map(({ id }) => id);
  const rewritten = await rewriteValues(
    tx,
    property.id,
    and(
      choosingAny(property, removed),
      projectId === undefined ? undefined : eq(issues.projectId, projectId),
    ),
    (value) => withoutOptions(property.type, value, removed),
    { touched: true },
  );
  await recordChanges(tx, actorId, property, rewritten);
  return rewritten.length;
}

/**
 * Takes every value of a property off the issues of every project, before the property goes,
 * each issue told in its history. Answers how many issues lost theirs.
 */
export async function takeValuesOff(
  tx: Transaction,
  actorId: string,
  property: PropertyRef,
): Promise<number> {
  const rewritten = await rewriteValues(tx, property.id, havingValue(property.id), () => null, {
    touched: true,
  });
  await recordChanges(tx, actorId, property, rewritten);
  return rewritten.length;
}

/**
 * Moves a project's issues from options to others, the same names under new ids (a project
 * taking copies of the instance's options): nothing changes as people see it, nothing is told.
 */
export async function moveValues(
  tx: Transaction,
  property: PropertyRef,
  projectId: string,
  moves: ReadonlyMap<string, string>,
): Promise<void> {
  if (moves.size === 0) {
    return;
  }
  await rewriteValues(
    tx,
    property.id,
    and(eq(issues.projectId, projectId), choosingAny(property, [...moves.keys()])),
    (value) => withOptionsMoved(property.type, value, moves),
    { touched: false },
  );
}

/**
 * The property, of the instance (`projectId` null) or of one project, locked until the end of
 * the transaction, or `undefined` if there is none there.
 */
export async function lockedProperty(
  tx: Transaction,
  propertyId: string,
  projectId: string | null,
): Promise<PropertyRef | undefined> {
  const [property] = await tx
    .select({ id: properties.id, name: properties.name, type: properties.type })
    .from(properties)
    .where(and(eq(properties.id, propertyId), ofScope(projectId)))
    .for('update');
  return property;
}

/** The properties of the instance, or of one project. */
export function ofScope(projectId: string | null): SQL {
  return projectId === null ? isNull(properties.projectId) : eq(properties.projectId, projectId);
}
