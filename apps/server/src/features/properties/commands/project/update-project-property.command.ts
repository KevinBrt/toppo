import { projectPropertyParamsSchema, updatePropertyRequestSchema } from '@toppo/shared';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { saveFields, saveOptions } from '../../utils/property-saving.util.ts';
import { lockedProperty } from '../../utils/property-values.util.ts';

/** Saves a project's own property and all its options at once, as the instance's are saved. */
export const updateProjectProperty = defineCommand({
  name: 'property.updateInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectPropertyParamsSchema.extend(updatePropertyRequestSchema.shape),
  async handler(
    { tx, actor, project, log },
    { propertyId, options, removed, projectKey: _, ...fields },
  ): Promise<void> {
    const property = await lockedProperty(tx, propertyId, project.id);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    await saveFields(tx, propertyId, project.id, fields);
    const takenOff = await saveOptions(tx, actor.id, property, null, options, removed);
    log.info(
      { propertyId, projectId: project.id, takenOff, by: actor.id },
      'Project property saved',
    );
  },
});
