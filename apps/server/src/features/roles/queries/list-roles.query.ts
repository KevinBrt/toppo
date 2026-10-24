import { permissionsOfRole } from '@toppo/core';
import { schema } from '@toppo/db';
import { ROLES_MAX, type RolesResponse } from '@toppo/shared';
import { count, countDistinct, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { invitations, projectMembers, roles, users } = schema;

/** Every role with what it grants and who holds it, for the roles and permissions matrix. */
export const listRoles = defineQuery({
  name: 'role.list',
  access: { permission: 'instance.roles.manage' },
  input: z.object({}),
  async handler({ db }): Promise<RolesResponse> {
    const rows = await db
      .select({
        id: roles.id,
        name: roles.name,
        color: roles.color,
        grantsAll: roles.grantsAll,
        permissions: roles.permissions,
        notifyNewIssues: roles.notifyNewIssues,
      })
      .from(roles)
      .orderBy(roles.createdAt, roles.id)
      .limit(ROLES_MAX);
    // What blocks a deletion: members, deactivated ones too, pending invitations, and projects.
    const members = await db
      .select({ roleId: users.instanceRoleId, count: count() })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.instanceRoleId);
    const pending = await db
      .select({ roleId: invitations.roleId, count: count() })
      .from(invitations)
      .where(isNull(invitations.acceptedAt))
      .groupBy(invitations.roleId);
    const inProjects = await db
      .select({ roleId: projectMembers.roleId, count: countDistinct(projectMembers.projectId) })
      .from(projectMembers)
      .groupBy(projectMembers.roleId);

    const countOf = (counts: { roleId: string | null; count: number }[], roleId: string) =>
      counts.find((row) => row.roleId === roleId)?.count ?? 0;
    return {
      roles: rows.map((role) => ({
        ...role,
        permissions: permissionsOfRole(role),
        memberCount: countOf(members, role.id),
        invitationCount: countOf(pending, role.id),
        projectCount: countOf(inProjects, role.id),
      })),
    };
  },
});
