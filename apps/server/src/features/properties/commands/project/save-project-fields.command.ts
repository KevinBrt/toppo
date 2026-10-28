import { schema } from '@toppo-tracker/db';
import { projectFieldsSchema, projectIssuesParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';

const { projects } = schema;

/**
 * How a project adapts the category and the priority of its issues: hidden (they keep the
 * default), or asked at creation with none chosen beforehand.
 */
export const saveProjectFields = defineCommand({
  name: 'project.saveFields',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectIssuesParamsSchema.extend(projectFieldsSchema.shape),
  async handler({ tx, actor, project, log }, { category, priority }): Promise<void> {
    await tx
      .update(projects)
      .set({
        categoryHidden: category.hidden,
        categoryRequired: category.required,
        priorityHidden: priority.hidden,
        priorityRequired: priority.required,
      })
      .where(eq(projects.id, project.id));
    log.info({ projectId: project.id, category, priority, by: actor.id }, 'Project fields saved');
  },
});
