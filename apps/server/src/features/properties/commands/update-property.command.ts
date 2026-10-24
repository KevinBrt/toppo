import { type OptionsPlan, planOptions } from '@toppo/core';
import { isUniqueViolation, schema, uuidv7 } from '@toppo/db';
import {
  type PropertyOptionDraft,
  propertyParamsSchema,
  updatePropertyRequestSchema,
} from '@toppo/shared';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { lockedProperty, takeOptionsOff } from '../utils/property-values.util.ts';

const { properties, propertyOptions } = schema;

type Plan = OptionsPlan<Omit<PropertyOptionDraft, 'id'>>;

/**
 * Saves a property and all its options at once, as the settings edit it: renamed, switched,
 * its options renamed, recolored, reordered, added to, and deleted when named so. A deleted
 * option leaves its issues, each told in its history, which keeps the option's name.
 */
export const updateProperty = defineCommand({
  name: 'property.update',
  access: { permission: 'instance.settings.manage' },
  input: propertyParamsSchema.extend(updatePropertyRequestSchema.shape),
  async handler(
    { tx, actor, log },
    { propertyId, options: requested, removed, ...fields },
  ): Promise<void> {
    const property = await lockedProperty(tx, propertyId);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const stored = await tx
      .select({ id: propertyOptions.id, name: propertyOptions.name, color: propertyOptions.color })
      .from(propertyOptions)
      .where(eq(propertyOptions.propertyId, propertyId))
      .orderBy(asc(propertyOptions.position))
      .for('update');
    const plan = planOptions(
      stored.map(({ id }) => id),
      requested,
      removed,
    );
    if (!plan) {
      throw new HttpError(409, 'PROPERTY_CHANGED', 'The property changed meanwhile');
    }
    // Taken off under the names they had: their issues' history keeps them.
    const takenOff = await takeOptionsOff(
      tx,
      actor.id,
      property,
      stored.filter(({ id }) => plan.removed.includes(id)),
    );
    if (plan.removed.length > 0) {
      await tx.delete(propertyOptions).where(inArray(propertyOptions.id, plan.removed));
    }
    try {
      await tx.update(properties).set(fields).where(eq(properties.id, propertyId));
      await keepAndAdd(tx, propertyId, plan, stored);
    } catch (error) {
      // The forms compare names in lower case as JavaScript does; PostgreSQL has the last word.
      if (isUniqueViolation(error, 'properties_name_unique')) {
        throw new HttpError(409, 'PROPERTY_NAME_TAKEN', 'Another property has this name');
      }
      if (isUniqueViolation(error, 'property_options_name_unique')) {
        throw new HttpError(409, 'OPTION_NAME_TAKEN', 'Two options would share a name');
      }
      throw error;
    }
    log.info(
      {
        propertyId,
        by: actor.id,
        added: plan.added.length,
        removed: plan.removed.length,
        takenOff,
      },
      'Property saved',
    );
  },
});

async function keepAndAdd(
  tx: Transaction,
  propertyId: string,
  { kept, added }: Plan,
  stored: readonly { id: string; name: string }[],
): Promise<void> {
  const renamed = kept.filter(
    ({ id, name }) => stored.find((option) => option.id === id)?.name !== name,
  );
  // Names are unique, checked row by row: the renamed options first give theirs up, so that two
  // of them can swap names, then take their new ones.
  if (renamed.length > 0) {
    await tx
      .update(propertyOptions)
      .set({ name: sql`${propertyOptions.id}::text` })
      .where(
        inArray(
          propertyOptions.id,
          renamed.map(({ id }) => id),
        ),
      );
  }
  for (const { id, name, color, position } of kept) {
    await tx
      .update(propertyOptions)
      .set({ name, color, position })
      .where(eq(propertyOptions.id, id));
  }
  if (added.length > 0) {
    await tx.insert(propertyOptions).values(
      added.map(({ name, color, position }) => ({
        id: uuidv7(),
        propertyId,
        name,
        color,
        position,
      })),
    );
  }
}
