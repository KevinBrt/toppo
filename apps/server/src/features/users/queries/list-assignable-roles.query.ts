import { schema } from '@toppo-tracker/db';
import type { AssignableRolesResponse } from '@toppo-tracker/shared';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { roles } = schema;

/** The roles an administrator can give to users, in creation order. */
export const listAssignableRoles = defineQuery({
  name: 'user.listRoles',
  access: { permission: 'instance.users.manage' },
  input: z.object({}),
  async handler({ db }): Promise<AssignableRolesResponse> {
    const rows = await db
      .select({ id: roles.id, name: roles.name, color: roles.color })
      .from(roles)
      .orderBy(roles.createdAt, roles.id);
    return { roles: rows };
  },
});
