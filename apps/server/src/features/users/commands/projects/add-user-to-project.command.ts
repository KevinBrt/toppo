import { canActOnRole } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { userProjectParamsSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { reachableBy } from '../../../../platform/auth/project-access.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { projectMembers, projects, roles, users } = schema;

/**
 * Gives a member access to a project the caller reaches, with their own role there. Already in,
 * nothing changes.
 */
export const addUserToProject = defineCommand({
  name: 'user.joinProject',
  access: { permission: 'instance.users.manage' },
  input: userProjectParamsSchema,
  async handler({ tx, actor, log }, { userId, projectKey }): Promise<void> {
    const [user] = await tx
      .select({ grantsAll: roles.grantsAll })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'This user does not exist');
    }
    if (!canActOnRole(actor.permissions, user)) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    const [project] = await tx
      .select({ id: projects.id, archivedAt: projects.archivedAt })
      .from(projects)
      .where(and(eq(projects.key, projectKey), reachableBy(actor.id)));
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
    }
    if (project.archivedAt) {
      throw new HttpError(409, 'PROJECT_ARCHIVED', 'This project is archived: it is read-only');
    }

    await tx
      .insert(projectMembers)
      .values({ projectId: project.id, userId })
      .onConflictDoNothing({ target: [projectMembers.projectId, projectMembers.userId] });
    log.info({ userId, projectId: project.id, by: actor.id }, 'Member added to a project');
  },
});
