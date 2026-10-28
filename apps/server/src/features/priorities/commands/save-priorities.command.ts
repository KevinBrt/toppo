import { isUniqueViolation, schema } from '@toppo-tracker/db';
import { prioritiesRequestSchema } from '@toppo-tracker/shared';
import { eq, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { priorities } = schema;

/**
 * Saves the four levels at once: their names and which one new issues get. A level's icon and
 * color come with it. Issues keep theirs; their history keeps the names they had.
 */
export const savePriorities = defineCommand({
  name: 'priority.saveAll',
  access: { permission: 'instance.settings.manage' },
  input: prioritiesRequestSchema,
  async handler({ tx, actor, log }, { priorities: requested }): Promise<void> {
    // Every level locked until the transaction ends: two saves apply one after the other.
    const stored = await tx.select({ id: priorities.id }).from(priorities).for('update');
    const ids = new Set(stored.map(({ id }) => id));
    // The request names four levels, each once: all of them stored means every level once.
    if (!requested.every(({ id }) => ids.has(id))) {
      throw new HttpError(404, 'PRIORITY_NOT_FOUND', 'This priority does not exist');
    }

    try {
      // Names and the default are unique, checked row by row: every level first gives its own
      // up, so that two can swap names, then takes its new one.
      await tx.update(priorities).set({ name: sql`${priorities.id}::text`, isDefault: false });
      for (const { id, name, isDefault } of requested) {
        await tx.update(priorities).set({ name, isDefault }).where(eq(priorities.id, id));
      }
    } catch (error) {
      if (isUniqueViolation(error, 'priorities_name_unique')) {
        throw new HttpError(409, 'PRIORITY_NAME_TAKEN', 'Two priorities would share a name');
      }
      throw error;
    }
    log.info({ by: actor.id }, 'Priorities saved');
  },
});
