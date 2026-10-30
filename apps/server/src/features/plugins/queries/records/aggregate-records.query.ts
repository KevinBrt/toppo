import { schema } from '@toppo-tracker/db';
import {
  type EntityDeclaration,
  HOST_CALLS,
  RECORD_GROUPS_MAX,
} from '@toppo-tracker/plugin-sdk/protocol';
import { and, count, desc, eq, type SQL, sql } from 'drizzle-orm';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import {
  entityOf,
  pluginOf,
  recordsWhere,
  visibleRecords,
} from '../../utils/records/plugin-records.util.ts';
import { fieldConditionsOf, recordGroupingOf } from '../../utils/records/record-query.util.ts';
import {
  type IndexedField,
  indexedColumnOf,
  indexedFieldsOf,
  slotValueOf,
} from '../../utils/records/record-slots.util.ts';

const { issues, pluginRecords, projects } = schema;

/**
 * What is counted or summed: the records, or a number field of theirs, from its slot when it is
 * indexed.
 */
function measureOf(
  op: 'count' | 'sum',
  field: string | undefined,
  name: string,
  entity: EntityDeclaration,
  indexed: readonly IndexedField[],
): SQL<string | number> {
  if (op === 'count') {
    return count();
  }
  const declared =
    field !== undefined && Object.hasOwn(entity.fields.properties, field)
      ? entity.fields.properties[field]
      : undefined;
  if (!(field && declared && (declared.type === 'number' || declared.type === 'integer'))) {
    throw new HttpError(400, 'RECORD_INVALID', `Only a number field of ${name} is summed`);
  }
  const slot = indexed.find((candidate) => candidate.field === field);
  const value = slot
    ? indexedColumnOf(slot)
    : slotValueOf(sql`${pluginRecords.data}`, field, declared);
  return sql<string>`coalesce(sum(${value}), 0)`;
}

/**
 * A count of the records of one of the plugin's entities, or the sum of a number field of
 * theirs, as far as it, and whoever it acts for, sees them; by issue, project, author or indexed
 * field when asked, the largest first. Derived data follows the visibility of its source.
 */
export const aggregateRecords = defineQuery({
  name: 'plugin.aggregateRecords',
  access: 'authenticated',
  input: HOST_CALLS['entities.aggregate'].args,
  async handler(
    { db, actor },
    { entity: name, op, field, where, groupBy },
  ): Promise<{ total: number; groups?: { key: string | number | null; value: number }[] }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(db, plugin, name);
    const indexed = await indexedFieldsOf(db, plugin.slug, name, entity);
    const measure = measureOf(op, field, name, entity, indexed);
    const condition = and(
      visibleRecords(plugin, name, entity),
      recordsWhere(where),
      fieldConditionsOf(indexed, name, where.fields),
    );
    const grouping = groupBy === undefined ? undefined : recordGroupingOf(indexed, name, groupBy);
    const [all] = await db
      .select({ value: measure })
      .from(pluginRecords)
      .leftJoin(projects, eq(projects.id, pluginRecords.projectId))
      .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
      .where(condition);
    const total = Number(all?.value ?? 0);
    if (grouping === undefined) {
      return { total };
    }
    const groups = await db
      .select({ key: grouping.key, value: measure })
      .from(pluginRecords)
      .leftJoin(projects, eq(projects.id, pluginRecords.projectId))
      .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
      .where(and(condition, grouping.condition))
      // By the key, first of the columns: written twice, its parameters would make it two.
      .groupBy(sql`1`)
      .orderBy(desc(measure))
      .limit(RECORD_GROUPS_MAX);
    return {
      total,
      groups: groups.map((group) => ({
        key: grouping.read(group.key),
        value: Number(group.value),
      })),
    };
  },
});
