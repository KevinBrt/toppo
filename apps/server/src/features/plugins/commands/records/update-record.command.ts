import { schema } from '@toppo-tracker/db';
import { HOST_CALLS } from '@toppo-tracker/plugin-sdk/protocol';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import {
  checkedFields,
  entityOf,
  pluginOf,
  recordToChange,
} from '../../utils/records/plugin-records.util.ts';
import { slotsToWrite, slotWritesOf } from '../../utils/records/record-slots.util.ts';

const { pluginRecords } = schema;

/**
 * Changes a record the plugin, and whoever it acts for, sees: the fields given replace those it
 * had, the whole checked again by Toppo as the entity declares it, its slots written again.
 */
export const updateRecord = defineCommand({
  name: 'plugin.updateRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.update'].args,
  async handler({ tx, actor }, { entity: name, id, fields }): Promise<void> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(tx, plugin, name);
    const record = await recordToChange(tx, plugin, name, entity, id);
    const data = checkedFields(entity, { ...record.fields, ...fields });
    const indexed = await slotsToWrite(tx, plugin.slug, name, entity);
    await tx
      .update(pluginRecords)
      .set({ data, ...slotWritesOf(indexed, data) })
      .where(eq(pluginRecords.id, id));
  },
});
