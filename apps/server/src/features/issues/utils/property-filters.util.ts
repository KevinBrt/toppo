import { type PropertyCondition, propertyConditionOf } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import type { PropertyFilter } from '@toppo/shared';
import { and, not, or, type SQL, sql } from 'drizzle-orm';
import { HttpError } from '../../../platform/http/http-error.ts';
import { propertyFields } from './issue-properties.util.ts';

const { issues } = schema;

/** Issues whose values contain these, found through the index of the values. */
const containing = (values: Record<string, unknown>) =>
  sql`${issues.properties} @> ${JSON.stringify(values)}::jsonb`;

/** Issues having a value of a property, found through the index of the values. */
const havingValue = (propertyId: string) =>
  sql`${issues.properties} @? ${`$."${propertyId}"`}::jsonpath`;

/**
 * A condition as SQL: options and people through the index of the values, ranges compared on the
 * values of the project's issues. A value not of the type's shape (none should be) never passes.
 */
function conditionSql(condition: PropertyCondition): SQL | undefined {
  const { propertyId } = condition;
  switch (condition.kind) {
    case 'any':
      return or(
        condition.none ? not(havingValue(propertyId)) : undefined,
        ...condition.ids.map((id) => containing({ [propertyId]: condition.several ? [id] : id })),
      );
    case 'ticked': {
      const ticked = containing({ [propertyId]: true });
      return condition.ticked ? ticked : not(ticked);
    }
    case 'between':
      return betweenSql(condition);
  }
}

/** Numbers or days within a range, compared on each issue's value, an open end left out. */
function betweenSql(condition: Extract<PropertyCondition, { kind: 'between' }>): SQL | undefined {
  const value = sql`${issues.properties} -> ${condition.propertyId}::text`;
  const ends = (compared: SQL, from: SQL | null, to: SQL | null) =>
    and(
      from === null ? undefined : sql`${compared} >= ${from}`,
      to === null ? undefined : sql`${compared} <= ${to}`,
    );
  if (condition.type === 'number') {
    // Numbers in JSON compare as numbers.
    const number = (end: number | null) => (end === null ? null : sql`to_jsonb(${end}::numeric)`);
    return and(
      sql`jsonb_typeof(${value}) = 'number'`,
      ends(value, number(condition.from), number(condition.to)),
    );
  }
  // Days written `2026-11-02` compare as text, byte by byte whatever the database's collation.
  const day = sql`(${issues.properties} ->> ${condition.propertyId}::text) collate "C"`;
  const text = (end: string | null) => (end === null ? null : sql`${end}`);
  return and(
    sql`jsonb_typeof(${value}) = 'string'`,
    ends(day, text(condition.from), text(condition.to)),
  );
}

/**
 * The conditions property filters set on a project's issues, each checked against a property the
 * project takes and its type, `me` standing for the caller.
 */
export async function propertyFiltersOf(
  db: Pick<Db, 'select'>,
  projectId: string,
  filters: readonly PropertyFilter[] | undefined,
  callerId: string,
): Promise<(SQL | undefined)[]> {
  if (!filters?.length) {
    return [];
  }
  const fields = await propertyFields(db, projectId);
  return filters.map((filter) => {
    const property = fields.find(({ id }) => id === filter.propertyId);
    if (!property) {
      throw new HttpError(400, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const condition = propertyConditionOf(property, filter, callerId);
    if (!condition) {
      throw new HttpError(400, 'INVALID_PROPERTY_FILTER', 'This property cannot be filtered so');
    }
    return conditionSql(condition);
  });
}
