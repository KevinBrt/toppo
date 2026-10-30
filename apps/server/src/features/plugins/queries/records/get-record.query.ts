import { schema } from '@toppo-tracker/db';
import { HOST_CALLS, type RecordData } from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq } from 'drizzle-orm';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';
import {
  entityOf,
  pluginOf,
  RECORD_COLUMNS,
  recordOf,
  visibleRecords,
} from '../../utils/records/plugin-records.util.ts';

const { issues, pluginRecords, projects } = schema;

/** A record of the plugin's, if it, and whoever it acts for, sees it; `null` otherwise. */
export const getRecord = defineQuery({
  name: 'plugin.getRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.get'].args,
  async handler({ db, actor }, { entity: name, id }): Promise<RecordData | null> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(db, plugin, name);
    const [record] = await db
      .select(RECORD_COLUMNS)
      .from(pluginRecords)
      .innerJoin(projects, eq(projects.id, pluginRecords.projectId))
      .leftJoin(issues, eq(issues.id, pluginRecords.issueId))
      .where(and(eq(pluginRecords.id, id), visibleRecords(plugin, name, entity.attachedTo)));
    return record ? recordOf(record) : null;
  },
});
