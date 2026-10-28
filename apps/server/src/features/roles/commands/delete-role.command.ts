import { schema } from '@toppo-tracker/db';
import { roleIdParamsSchema } from '@toppo-tracker/shared';
import { and, count, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { invitations, projectMembers, roles, users } = schema;

/**
 * Deletes a role nobody holds: no member, even deactivated, no pending invitation, and no project
 * giving it to one of its members. Deleted accounts and accepted invitations simply lose it. The
 * database refuses the rest anyway.
 */
export const deleteRole = defineCommand({
  name: 'role.delete',
  access: { permission: 'instance.roles.manage' },
  input: roleIdParamsSchema,
  async handler({ tx, actor, log }, { roleId }): Promise<void> {
    // Locked: a member given this role meanwhile waits, then finds it gone.
    const [role] = await tx
      .select({ grantsAll: roles.grantsAll })
      .from(roles)
      .where(eq(roles.id, roleId))
      .for('update');
    if (!role) {
      throw new HttpError(404, 'ROLE_NOT_FOUND', 'This role does not exist');
    }
    if (role.grantsAll) {
      throw new HttpError(403, 'SYSTEM_ROLE_LOCKED', 'The system role cannot be deleted');
    }
    const [members] = await tx
      .select({ count: count() })
      .from(users)
      .where(and(eq(users.instanceRoleId, roleId), isNull(users.deletedAt)));
    const [pending] = await tx
      .select({ count: count() })
      .from(invitations)
      .where(and(eq(invitations.roleId, roleId), isNull(invitations.acceptedAt)));
    const [inProjects] = await tx
      .select({ count: count() })
      .from(projectMembers)
      .where(eq(projectMembers.roleId, roleId));
    const holders = [members, pending, inProjects].reduce((sum, row) => sum + (row?.count ?? 0), 0);
    if (holders > 0) {
      throw new HttpError(409, 'ROLE_IN_USE', 'Members, invitations or projects still give it');
    }

    await tx.delete(roles).where(eq(roles.id, roleId));
    log.info({ roleId, by: actor.id }, 'Role deleted');
  },
});
