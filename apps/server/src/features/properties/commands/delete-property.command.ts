import { propertyParamsSchema } from '@toppo/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { deleteWithValues } from '../utils/property-saving.util.ts';
import { lockedProperty } from '../utils/property-values.util.ts';

/**
 * Deletes a property of the instance: its values, in every project, leave their issues, each
 * told in its history, which keeps the names.
 */
export const deleteProperty = defineCommand({
  name: 'property.delete',
  access: { permission: 'instance.settings.manage' },
  input: propertyParamsSchema,
  async handler({ tx, actor, log }, { propertyId }): Promise<void> {
    const property = await lockedProperty(tx, propertyId, null);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const takenOff = await deleteWithValues(tx, actor.id, property);
    log.info({ propertyId, takenOff, by: actor.id }, 'Property deleted');
  },
});
