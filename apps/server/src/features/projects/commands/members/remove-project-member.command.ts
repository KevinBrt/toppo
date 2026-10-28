import { canActOnProjectMember } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { projectMemberParamsSchema } from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { projectMembers, roles, users } = schema;
const projectRoles = alias(roles, 'project_roles');

/**
 * Takes a member out of the project. Members given every project, and the system role, still
 * reach it: they only lose the role the project gave them.
 */
export const removeProjectMember = defineCommand({
  name: 'project.removeMember',
  access: { project: 'projectKey', permission: 'project.members.manage' },
  input: projectMemberParamsSchema,
  async handler({ tx, actor, project, log }, { userId }): Promise<void> {
    const [member] = await tx
      .select({
        allProjects: users.allProjects,
        ownRole: { grantsAll: roles.grantsAll, permissions: roles.permissions },
        projectRole: { grantsAll: projectRoles.grantsAll, permissions: projectRoles.permissions },
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .leftJoin(projectRoles, eq(projectRoles.id, projectMembers.roleId))
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)))
      .for('update', { of: projectMembers });
    if (!member) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'This person is not a member of the project');
    }
    // Someone given every project still reaches it, with their own role from then on: like going
    // back to it, that role must be within the actor's too.
    const beyond =
      !canActOnProjectMember(project.permissions, member.projectRole ?? member.ownRole) ||
      (member.allProjects && !canActOnProjectMember(project.permissions, member.ownRole));
    if (beyond) {
      throw new HttpError(
        403,
        'ROLE_BEYOND_YOURS',
        'This member holds more than you do in this project',
      );
    }

    await tx
      .delete(projectMembers)
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    log.info({ projectId: project.id, userId, by: actor.id }, 'Member removed');
  },
});
