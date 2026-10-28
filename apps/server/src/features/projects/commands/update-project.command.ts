import { isUniqueViolation, schema } from '@toppo-tracker/db';
import { projectKeyParamsSchema, updateProjectRequestSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { projects } = schema;

/**
 * Renames a project and changes its description and color, and its key until its first issue
 * exists: a key already passed on in an issue number never changes. `projectKey` is the current
 * key.
 */
export const updateProject = defineCommand({
  name: 'project.update',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema.extend(updateProjectRequestSchema.shape),
  async handler({ tx, actor, project, log }, { key, name, description, color }): Promise<void> {
    if (key !== project.key) {
      // Locked: an issue being created meanwhile is numbered before the check, not after.
      const [current] = await tx
        .select({ nextIssueNumber: projects.nextIssueNumber })
        .from(projects)
        .where(eq(projects.id, project.id))
        .for('update');
      if (current && current.nextIssueNumber > 1) {
        throw new HttpError(409, 'PROJECT_KEY_FIXED', 'The key of a project with issues is fixed');
      }
    }
    try {
      await tx
        .update(projects)
        .set({ key, name, description, color })
        .where(eq(projects.id, project.id));
    } catch (error) {
      // Another project took this key meanwhile.
      if (isUniqueViolation(error, 'projects_key_unique')) {
        throw new HttpError(409, 'PROJECT_KEY_TAKEN', 'Another project has this key');
      }
      throw error;
    }
    log.info({ projectId: project.id, by: actor.id }, 'Project updated');
  },
});
