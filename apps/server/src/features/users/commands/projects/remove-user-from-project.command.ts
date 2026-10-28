import { canActOnRole } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { userProjectParamsSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { reachableBy } from '../../../../platform/auth/project-access.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { projectMembers, projects, roles, users } = schema;

/**
 * Takes a member out of a project the caller reaches, with the role it gave them. A member given
 * every project still reaches it.
 */
export const removeUserFromProject = defineCommand({
  name: 'user.leaveProject',
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
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.key, projectKey), reachableBy(actor.id)));
    if (!project) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
    }

    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    log.info({ userId, projectId: project.id, by: actor.id }, 'Member removed from a project');
  },
});
