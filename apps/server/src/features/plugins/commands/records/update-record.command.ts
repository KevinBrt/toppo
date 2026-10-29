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

const { pluginRecords } = schema;

/**
 * Changes a record the plugin, and whoever it acts for, sees: the fields given replace those it
 * had, the whole checked again by Toppo as the entity declares it.
 */
export const updateRecord = defineCommand({
  name: 'plugin.updateRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.update'].args,
  async handler({ tx, actor }, { entity: name, id, fields }): Promise<void> {
    const plugin = pluginOf(actor);
    const entity = await entityOf(tx, plugin, name);
    const record = await recordToChange(tx, plugin, name, entity, id);
    await tx
      .update(pluginRecords)
      .set({ data: checkedFields(entity, { ...record.fields, ...fields }) })
      .where(eq(pluginRecords.id, id));
  },
});
