import { createPropertyRequestSchema } from '@toppo-tracker/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { insertProperty } from '../utils/property-saving.util.ts';

/**
 * Adds a property to the instance, with its options in their order: every project's issues may
 * take it from now on. Answers its id.
 */
export const createProperty = defineCommand({
  name: 'property.create',
  access: { permission: 'instance.settings.manage' },
  input: createPropertyRequestSchema,
  async handler({ tx, actor, log }, request): Promise<{ id: string }> {
    const id = await insertProperty(tx, null, request);
    log.info({ propertyId: id, options: request.options.length, by: actor.id }, 'Property created');
    return { id };
  },
});
