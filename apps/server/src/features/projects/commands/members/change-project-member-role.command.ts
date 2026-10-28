import { canActOnProjectMember, canGiveProjectRole, type RoleGrants } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  changeProjectMemberRoleRequestSchema,
  projectMemberParamsSchema,
} from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineCommand, type Transaction } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';

const { projectMembers, roles, users } = schema;
const projectRoles = alias(roles, 'project_roles');

const beyondYours = () =>
  new HttpError(403, 'ROLE_BEYOND_YOURS', 'You cannot give more than you hold in this project');

/**
 * Gives a member of the project another role there, or back their own (`null`). Neither the role
 * they have nor the one they get may exceed what the actor holds in the project.
 */
export const changeProjectMemberRole = defineCommand({
  name: 'project.changeMemberRole',
  access: { project: 'projectKey', permission: 'project.members.manage' },
  input: projectMemberParamsSchema.extend(changeProjectMemberRoleRequestSchema.shape),
  async handler({ tx, actor, project, log }, { userId, roleId }): Promise<void> {
    // Locked: two managers changing the same member are serialized.
    const [member] = await tx
      .select({
        ownRole: { grantsAll: roles.grantsAll, permissions: roles.permissions },
        projectRole: { grantsAll: projectRoles.grantsAll, permissions: projectRoles.permissions },
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .innerJoin(roles, eq(roles.id, users.instanceRoleId))
      .leftJoin(projectRoles, eq(projectRoles.id, projectMembers.roleId))
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          eq(projectMembers.userId, userId),
          isNull(users.deletedAt),
        ),
      )
      .for('update', { of: projectMembers });
    if (!member) {
      throw new HttpError(404, 'MEMBER_NOT_FOUND', 'This person is not a member of the project');
    }
    // The system role keeps every permission everywhere: a role of the project would mean nothing.
    if (roleId !== null && member.ownRole.grantsAll) {
      throw new HttpError(
        409,
        'SYSTEM_ROLE_HOLDER',
        'The system role has every permission in every project',
      );
    }
    if (!canActOnProjectMember(project.permissions, member.projectRole ?? member.ownRole)) {
      throw beyondYours();
    }
    const role = roleId === null ? null : await givenRole(tx, roleId);
    const allowed = role
      ? canGiveProjectRole(project.permissions, role)
      : canActOnProjectMember(project.permissions, member.ownRole);
    if (!allowed) {
      throw beyondYours();
    }

    await tx
      .update(projectMembers)
      .set({ roleId })
      .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, userId)));
    log.info({ projectId: project.id, userId, roleId, by: actor.id }, 'Member role changed');
  },
});

/** The role to give, share-locked: it cannot be deleted before the membership giving it is saved. */
async function givenRole(tx: Transaction, roleId: string): Promise<RoleGrants> {
  const [role] = await tx
    .select({ grantsAll: roles.grantsAll, permissions: roles.permissions })
    .from(roles)
    .where(eq(roles.id, roleId))
    .for('key share');
  if (!role) {
    throw new HttpError(400, 'INVALID_ROLE', 'This role does not exist');
  }
  return role;
}
