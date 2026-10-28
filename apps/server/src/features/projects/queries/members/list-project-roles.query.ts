import { canGiveProjectRole } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  type AssignableRolesResponse,
  projectKeyParamsSchema,
  ROLES_MAX,
} from '@toppo-tracker/shared';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';

const { roles } = schema;

/** The roles the caller may give in the project: none granting more than they hold there. */
export const listProjectRoles = defineQuery({
  name: 'project.listRoles',
  access: { project: 'projectKey', permission: 'project.members.manage' },
  input: projectKeyParamsSchema,
  async handler({ db, actor, project }): Promise<AssignableRolesResponse> {
    const rows = await db
      .select({
        id: roles.id,
        name: roles.name,
        color: roles.color,
        grantsAll: roles.grantsAll,
        permissions: roles.permissions,
      })
      .from(roles)
      .orderBy(roles.createdAt, roles.id)
      .limit(ROLES_MAX);
    return {
      roles: rows
        .filter((role) => canGiveProjectRole(project.permissions, role, actor.pluginPermissions))
        .map(({ id, name, color }) => ({ id, name, color })),
    };
  },
});
