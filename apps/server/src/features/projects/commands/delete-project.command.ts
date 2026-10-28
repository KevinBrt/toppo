import { schema } from '@toppo-tracker/db';
import { projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { activities, issues, projects } = schema;

/**
 * Deletes a project for good, with its issues and their history; its members, invitations and
 * workflow go with it. Issues and activities never leave by cascade: only this command removes
 * them. An archived project can be deleted, the usual way there.
 */
export const deleteProject = defineCommand({
  name: 'project.delete',
  access: { project: 'projectKey', permission: 'project.delete', evenArchived: true },
  input: projectKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    // Locked first, as issue creation does: no issue is numbered in the project while it goes.
    await tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, project.id))
      .for('update');
    await tx.delete(issues).where(eq(issues.projectId, project.id));
    // What is left: activities without an issue, such as the deletion of one.
    await tx.delete(activities).where(eq(activities.projectId, project.id));
    await tx.delete(projects).where(eq(projects.id, project.id));
    log.info({ projectId: project.id, key: project.key, by: actor.id }, 'Project deleted');
  },
});
