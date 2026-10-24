import { propertyParamsSchema, updatePropertyRequestSchema } from '@toppo/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { saveFields, saveOptions } from '../utils/property-saving.util.ts';
import { lockedProperty } from '../utils/property-values.util.ts';

/**
 * Saves a property of the instance and all its options at once, as the settings edit it:
 * renamed, switched, its options renamed, recolored, reordered, added to, and deleted when named
 * so. A deleted option leaves its issues, each told in its history, which keeps its name. The
 * projects' own options of the property stay theirs.
 */
export const updateProperty = defineCommand({
  name: 'property.update',
  access: { permission: 'instance.settings.manage' },
  input: propertyParamsSchema.extend(updatePropertyRequestSchema.shape),
  async handler({ tx, actor, log }, { propertyId, options, removed, ...fields }): Promise<void> {
    const property = await lockedProperty(tx, propertyId, null);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    await saveFields(tx, propertyId, null, fields);
    const takenOff = await saveOptions(tx, actor.id, property, null, options, removed);
    log.info({ propertyId, takenOff, by: actor.id }, 'Property saved');
  },
});
