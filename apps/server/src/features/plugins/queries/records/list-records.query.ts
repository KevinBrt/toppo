import { schema } from '@toppo-tracker/db';
import { HOST_CALLS, type RecordData } from '@toppo-tracker/plugin-sdk/protocol';
import { and, count, eq } from 'drizzle-orm';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import {
  entityOf,
  pluginOf,
  RECORD_COLUMNS,
  recordOf,
  recordsWhere,
  visibleRecords,
} from '../../utils/records/plugin-records.util.ts';
import { fieldConditionsOf, recordOrderOf } from '../../utils/records/record-query.util.ts';
import { indexedFieldsOf } from '../../utils/records/record-slots.util.ts';

const { issues, pluginRecords, projects } = schema;

/**
 * A page of the records of one of the plugin's entities, as far as it, and whoever it acts for,
 * sees them: on an issue, in a project, written by someone, with indexed fields as asked; the
 * latest written first, or sorted on an indexed field.
 */
export const listRecords = defineQuery({
  name: 'plugin.listRecords',
  access: 'authenticated',
  input: HOST_CALLS['entities.list'].args,
  async handler(
    { db, actor },
    { entity: name, where, orderBy, direction, page, pageSize },
  ): Promise<{ items: RecordData[]; total: number }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(db, plugin, name);
    const indexed = await indexedFieldsOf(db, plugin.slug, name, entity);
    const { order, condition: sorted } = recordOrderOf(indexed, name, orderBy, direction);
    const condition = and(
      visibleRecords(plugin, name, entity),
      recordsWhere(where),
      fieldConditionsOf(indexed, name, where.fields),
      sorted,
    );
    const [items, [counted]] = await Promise.all([
      db
        .select(RECORD_COLUMNS)
        .from(pluginRecords)
        .leftJoin(projects, eq(projects.id, pluginRecords.projectId))
        .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
        .where(condition)
        .orderBy(...order)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(pluginRecords)
        .leftJoin(projects, eq(projects.id, pluginRecords.projectId))
        .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
        .where(condition),
    ]);
    return { items: items.map(recordOf), total: counted?.total ?? 0 };
  },
});
