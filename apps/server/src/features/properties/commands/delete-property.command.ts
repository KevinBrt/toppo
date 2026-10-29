import { propertyParamsSchema } from '@toppo-tracker/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { deleteWithValues } from '../utils/property-saving.util.ts';
import { lockedProperty, writingOf } from '../utils/property-values.util.ts';

/**
 * Deletes a property of the instance: its values, in every project, leave their issues, each
 * told in its history, which keeps the names. A plugin's stays while the plugin is installed:
 * it goes with the plugin's data.
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
    if ((await writingOf(tx, propertyId)).ofInstalledPlugin) {
      throw new HttpError(
        409,
        'PROPERTY_OF_PLUGIN',
        'A plugin added this property: it goes when the plugin is uninstalled with its data',
      );
    }
    const takenOff = await deleteWithValues(tx, actor.id, property);
    log.info({ propertyId, takenOff, by: actor.id }, 'Property deleted');
  },
});
