import { createPropertyRequestSchema, projectIssuesParamsSchema } from '@toppo/shared';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { insertProperty } from '../../utils/property-saving.util.ts';

/**
 * Adds a property to one project, with its options in their order: its issues take it beside
 * the instance's. Its name is none of theirs. Answers its id.
 */
export const createProjectProperty = defineCommand({
  name: 'property.createInProject',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectIssuesParamsSchema.extend(createPropertyRequestSchema.shape),
  async handler(
    { tx, actor, project, log },
    { projectKey: _, ...request },
  ): Promise<{ id: string }> {
    const id = await insertProperty(tx, project.id, request);
    log.info({ propertyId: id, projectId: project.id, by: actor.id }, 'Project property created');
    return { id };
  },
});
