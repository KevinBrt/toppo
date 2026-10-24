import { schema } from '@toppo/db';
import { propertyParamsSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { lockedProperty, takeOptionsOff } from '../utils/property-values.util.ts';

const { properties, propertyOptions } = schema;

/**
 * Deletes a property of the instance: its values leave their issues, each told in its history,
 * which keeps the names; its options go with it.
 */
export const deleteProperty = defineCommand({
  name: 'property.delete',
  access: { permission: 'instance.settings.manage' },
  input: propertyParamsSchema,
  async handler({ tx, actor, log }, { propertyId }): Promise<void> {
    const property = await lockedProperty(tx, propertyId);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const options = await tx
      .select({ id: propertyOptions.id, name: propertyOptions.name })
      .from(propertyOptions)
      .where(eq(propertyOptions.propertyId, propertyId))
      .for('update');
    const takenOff = await takeOptionsOff(tx, actor.id, property, options);
    await tx.delete(properties).where(eq(properties.id, propertyId));
    log.info({ propertyId, takenOff, by: actor.id }, 'Property deleted');
  },
});
