import { schema } from '@toppo-tracker/db';
import { HOST_CALLS } from '@toppo-tracker/plugin-sdk/protocol';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { entityOf, pluginOf, recordToChange } from '../../utils/records/plugin-records.util.ts';

const { pluginRecords } = schema;

/** Deletes a record the plugin, and whoever it acts for, sees. */
export const deleteRecord = defineCommand({
  name: 'plugin.deleteRecord',
  access: 'authenticated',
  input: HOST_CALLS['entities.delete'].args,
  async handler({ tx, actor }, { entity: name, id }): Promise<void> {
    const plugin = pluginOf(actor);
    await recordToChange(tx, plugin, name, await entityOf(tx, plugin, name), id);
    await tx.delete(pluginRecords).where(eq(pluginRecords.id, id));
  },
});
