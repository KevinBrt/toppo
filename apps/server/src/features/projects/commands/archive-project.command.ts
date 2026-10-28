import { schema } from '@toppo-tracker/db';
import { projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { projects } = schema;

/** Archives a project: it leaves the lists and becomes read-only, its issues kept. */
export const archiveProject = defineCommand({
  name: 'project.archive',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    await tx.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, project.id));
    log.info({ projectId: project.id, by: actor.id }, 'Project archived');
  },
});
