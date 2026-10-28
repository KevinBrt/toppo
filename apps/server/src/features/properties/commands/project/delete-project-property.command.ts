import { projectPropertyParamsSchema } from '@toppo-tracker/shared';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { deleteWithValues } from '../../utils/property-saving.util.ts';
import { lockedProperty } from '../../utils/property-values.util.ts';

/** Deletes a project's own property: its values leave their issues, told in their history. */
export const deleteProjectProperty = defineCommand({
  name: 'property.deleteInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectPropertyParamsSchema,
  async handler({ tx, actor, project, log }, { propertyId }): Promise<void> {
    const property = await lockedProperty(tx, propertyId, project.id);
    if (!property) {
      throw new HttpError(404, 'PROPERTY_NOT_FOUND', 'This property does not exist');
    }
    const takenOff = await deleteWithValues(tx, actor.id, property);
    log.info(
      { propertyId, projectId: project.id, takenOff, by: actor.id },
      'Project property deleted',
    );
  },
});
