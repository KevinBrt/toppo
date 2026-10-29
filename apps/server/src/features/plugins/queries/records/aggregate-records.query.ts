import { schema } from '@toppo-tracker/db';
import {
  type EntityDeclaration,
  HOST_CALLS,
  RECORD_GROUPS_MAX,
  type RecordGroup,
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

const { issues, pluginRecords, projects } = schema;

const GROUP_COLUMNS = {
  issueId: pluginRecords.issueId,
  projectId: pluginRecords.projectId,
  createdBy: pluginRecords.createdById,
} as const satisfies Record<RecordGroup, unknown>;

/** What is counted or summed: the records, or a number field of theirs. */
function measureOf(
  op: 'count' | 'sum',
  field: string | undefined,
  name: string,
  entity: EntityDeclaration,
): SQL<string | number> {
  if (op === 'count') {
    return count();
  }
  const declared =
    field !== undefined && Object.hasOwn(entity.fields.properties, field)
      ? entity.fields.properties[field]
      : undefined;
  if (!(field && (declared?.type === 'number' || declared?.type === 'integer'))) {
    throw new HttpError(400, 'RECORD_INVALID', `Only a number field of ${name} is summed`);
  }
  return sql<string>`coalesce(sum((${pluginRecords.data} ->> ${field})::numeric), 0)`;
}

/**
 * A count of the records of one of the plugin's entities, or the sum of a number field of
 * theirs, as far as it, and whoever it acts for, sees them; by issue, project or author when
 * asked, the largest first. Derived data follows the visibility of its source.
 */
export const aggregateRecords = defineQuery({
  name: 'plugin.aggregateRecords',
  access: 'authenticated',
  input: HOST_CALLS['entities.aggregate'].args,
  async handler(
    { db, actor },
    { entity: name, op, field, where, groupBy },
  ): Promise<{ total: number; groups?: { key: string | null; value: number }[] }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(db, plugin, name);
    const measure = measureOf(op, field, name, entity);
    const condition = and(visibleRecords(plugin, name, entity.attachedTo), recordsWhere(where));
    const [all] = await db
      .select({ value: measure })
      .from(pluginRecords)
      .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
      .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
      .where(condition);
    const total = Number(all?.value ?? 0);
    if (groupBy === undefined) {
      return { total };
    }
    const key = GROUP_COLUMNS[groupBy];
    const groups = await db
      .select({ key, value: measure })
      .from(pluginRecords)
      .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
      .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
      .where(condition)
      .groupBy(key)
      .orderBy(desc(measure))
      .limit(RECORD_GROUPS_MAX);
    return {
      total,
      groups: groups.map((group) => ({ key: group.key, value: Number(group.value) })),
    };
  },
});
