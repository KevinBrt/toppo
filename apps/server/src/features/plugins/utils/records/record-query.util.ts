import { schema } from '@toppo-tracker/db';
import {
  comparedValueSchemaOf,
  type FieldCondition,
  indexKindOf,
  RECORD_GROUPS,
  type RecordGroup,
} from '@toppo-tracker/plugin-sdk/protocol';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  lt,
  lte,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { type IndexedField, indexedColumnOf } from './record-slots.util.ts';

const { pluginRecords } = schema;

/** The field `field` of those the entity indexes; refused when it indexes no such field. */
export function indexedFieldNamed(
  indexed: readonly IndexedField[],
  name: string,
  field: string,
): IndexedField {
  const found = indexed.find((candidate) => candidate.field === field);
  if (!found) {
    throw new HttpError(400, 'RECORD_INVALID', `${name} indexes no field ${field}`);
  }
  return found;
}

/** A value checked of the kind of its field, typed as the field's slot keeps it. */
function comparedValueOf({ field, declared }: IndexedField, value: string | number): SQL {
  if (!comparedValueSchemaOf(declared)?.safeParse(value).success) {
    throw new HttpError(400, 'RECORD_INVALID', `${field} is compared with a value of another kind`);
  }
  switch (indexKindOf(declared)) {
    case 'number':
      return sql`${value}::numeric`;
    case 'date':
      return 'format' in declared && declared.format === 'date'
        ? sql`(${value}::date)::timestamp at time zone 'UTC'`
        : sql`${value}::timestamptz`;
    case 'ref':
      return sql`${value}::uuid`;
    default:
      return sql`${value}::text`;
  }
}

const BOUNDS = [
  ['gt', gt],
  ['gte', gte],
  ['lt', lt],
  ['lte', lte],
] as const;

function conditionOf(indexed: IndexedField, condition: FieldCondition): SQL | undefined {
  const column = indexedColumnOf(indexed);
  const value = (given: string | number) => comparedValueOf(indexed, given);
  if (typeof condition !== 'object') {
    return eq(column, value(condition));
  }
  if ('in' in condition) {
    return inArray(column, condition.in.map(value));
  }
  return and(
    ...BOUNDS.map(([bound, compare]) => {
      const given = condition[bound];
      return given === undefined ? undefined : compare(column, value(given));
    }),
  );
}

/** The records whose indexed fields are as the plugin asks: each field one the entity indexes. */
export function fieldConditionsOf(
  indexed: readonly IndexedField[],
  name: string,
  fields: Readonly<Record<string, FieldCondition>> | undefined,
): SQL | undefined {
  return and(
    ...Object.entries(fields ?? {}).map(([field, condition]) =>
      conditionOf(indexedFieldNamed(indexed, name, field), condition),
    ),
  );
}

/**
 * How records are sorted: when they were written, or on an indexed field and then when written.
 * A field sorted on is one every record has: those left without it (written before it was, of
 * another type) are left out, so that its index, partial, serves.
 */
export function recordOrderOf(
  indexed: readonly IndexedField[],
  name: string,
  orderBy: string,
  direction: 'asc' | 'desc',
): { order: SQL[]; condition: SQL | undefined } {
  const by = direction === 'asc' ? asc : desc;
  const written = [by(pluginRecords.createdAt), by(pluginRecords.id)];
  if (orderBy === 'createdAt') {
    return { order: written, condition: undefined };
  }
  const column = indexedColumnOf(indexedFieldNamed(indexed, name, orderBy));
  return { order: [by(column), ...written], condition: isNotNull(column) };
}

const GROUP_COLUMNS = {
  issueId: pluginRecords.issueId,
  projectId: pluginRecords.projectId,
  createdBy: pluginRecords.createdById,
} as const satisfies Record<RecordGroup, SQLWrapper>;

function isRecordGroup(groupBy: string): groupBy is RecordGroup {
  return (RECORD_GROUPS as readonly string[]).includes(groupBy);
}

/** The key each group of records is answered with, and how it reads. */
export interface RecordGrouping {
  key: SQL;
  condition: SQL | undefined;
  read(key: unknown): string | number | null;
}

/**
 * Records grouped by an anchor (an id, `null` for none), or by an indexed field: its value as
 * the plugin reads it (a date as `2026-10-28`), records without it left out.
 */
export function recordGroupingOf(
  indexed: readonly IndexedField[],
  name: string,
  groupBy: string,
): RecordGrouping {
  if (isRecordGroup(groupBy)) {
    return {
      key: sql`${GROUP_COLUMNS[groupBy]}`,
      condition: undefined,
      read: (key) => (typeof key === 'string' ? key : null),
    };
  }
  const field = indexedFieldNamed(indexed, name, groupBy);
  const column = indexedColumnOf(field);
  const grouping = { key: column, condition: isNotNull(column) };
  switch (indexKindOf(field.declared)) {
    case 'number':
      return { ...grouping, read: Number };
    case 'date': {
      const format =
        'format' in field.declared && field.declared.format === 'date'
          ? 'YYYY-MM-DD'
          : 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"';
      return {
        ...grouping,
        key: sql`to_char(${column} at time zone 'UTC', ${format})`,
        read: String,
      };
    }
    default:
      return { ...grouping, read: String };
  }
}
