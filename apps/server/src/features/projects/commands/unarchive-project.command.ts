import { schema } from '@toppo-tracker/db';
import { projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { projects } = schema;

/** Brings an archived project back into the lists, writable again. */
export const unarchiveProject = defineCommand({
  name: 'project.unarchive',
  access: { project: 'projectKey', permission: 'project.settings.manage', evenArchived: true },
  input: projectKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    await tx.update(projects).set({ archivedAt: null }).where(eq(projects.id, project.id));
    log.info({ projectId: project.id, by: actor.id }, 'Project unarchived');
  },
});
