import { schema } from '@toppo-tracker/db';
import { ENTITY_INDEXES_TOTAL, ENTITY_NAME, PLUGIN_ID } from '@toppo-tracker/plugin-sdk/protocol';
import { and, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { fillRecordSlots } from '../utils/records/record-slots.util.ts';

const { pluginRecordSlots } = schema;

/**
 * Copies to their slots the fields an entity came to index while records were already kept: a
 * batch of records per run, then the next batch in a job of its own, until none is left. Then the
 * slots it was queued for are filled, and queries read them. A slot given meanwhile is in the
 * batches that follow, and in the job its own change queued, which starts over.
 */
export const fillRecordSlotsJob = defineJob({
  type: 'plugin.records.fillSlots',
  payload: z.object({
    pluginSlug: z.string().regex(PLUGIN_ID),
    entity: z.string().regex(ENTITY_NAME),
    /** The slots to say filled at the end: those waiting when it was queued. */
    slotIds: z.array(z.uuid()).min(1).max(ENTITY_INDEXES_TOTAL),
    /** The last record filled by the run before; `null` to start. */
    after: z.uuid().nullable(),
  }),
  async handler({ tx, log }, { pluginSlug, entity, slotIds, after }) {
    const last = await fillRecordSlots(tx, pluginSlug, entity, after);
    if (last !== null) {
      await enqueue(tx, fillRecordSlotsJob, { pluginSlug, entity, slotIds, after: last });
      return;
    }
    await tx
      .update(pluginRecordSlots)
      .set({ filledAt: sql`now()` })
      .where(and(inArray(pluginRecordSlots.id, slotIds), isNull(pluginRecordSlots.filledAt)));
    log.info({ plugin: pluginSlug, entity }, 'Slots of a plugin’s records filled');
  },
});
