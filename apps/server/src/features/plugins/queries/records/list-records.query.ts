import { schema } from '@toppo-tracker/db';
import { HOST_CALLS, type RecordData } from '@toppo-tracker/plugin-sdk/protocol';
import { and, asc, count, desc, eq } from 'drizzle-orm';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import {
  entityOf,
  pluginOf,
  RECORD_COLUMNS,
  recordOf,
  recordsWhere,
  visibleRecords,
} from '../../utils/records/plugin-records.util.ts';

const { issues, pluginRecords, projects } = schema;

/**
 * A page of the records of one of the plugin's entities, as far as it, and whoever it acts for,
 * sees them: on an issue, in a project or written by someone, newest first unless asked.
 */
export const listRecords = defineQuery({
  name: 'plugin.listRecords',
  access: 'authenticated',
  input: HOST_CALLS['entities.list'].args,
  async handler(
    { db, actor },
    { entity: name, where, order, page, pageSize },
  ): Promise<{ items: RecordData[]; total: number }> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(db, plugin, name);
    const condition = and(visibleRecords(plugin, name, entity.attachedTo), recordsWhere(where));
    const byTime = order === 'newest' ? desc : asc;
    const [items, [counted]] = await Promise.all([
      db
        .select(RECORD_COLUMNS)
        .from(pluginRecords)
        .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
        .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
        .where(condition)
        .orderBy(byTime(pluginRecords.createdAt), byTime(pluginRecords.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db
        .select({ total: count() })
        .from(pluginRecords)
        .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
        .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
        .where(condition),
    ]);
    return { items: items.map(recordOf), total: counted?.total ?? 0 };
  },
});
