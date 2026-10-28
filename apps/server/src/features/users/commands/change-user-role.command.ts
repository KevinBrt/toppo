import { canActOnRole, keepsAnAdministrator } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { changeUserRoleRequestSchema, userIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { lockInstanceAccounts } from '../../../platform/auth/administrators.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { users } = schema;

/** Gives a member another role. Takes effect on their next request. */
export const changeUserRole = defineCommand({
  name: 'user.changeRole',
  access: { permission: 'instance.users.manage' },
  input: userIdParamsSchema.extend(changeUserRoleRequestSchema.shape),
  async handler({ tx, actor, log }, { userId, roleId }): Promise<void> {
    if (userId === actor.id) {
      throw new HttpError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Another member must change your role');
    }
    const accounts = await lockInstanceAccounts(tx, userId);
    const user = accounts.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'This user does not exist');
    }
    const current = accounts.roles.find((role) => role.id === user.roleId);
    const next = accounts.roles.find((role) => role.id === roleId);
    if (!next) {
      throw new HttpError(400, 'INVALID_ROLE', 'This role does not exist');
    }
    const { permissions } = actor;
    if (!(current && canActOnRole(permissions, current) && canActOnRole(permissions, next))) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    if (!keepsAnAdministrator(accounts, { type: 'changeRole', userId, roleId })) {
      throw new HttpError(409, 'LAST_ADMINISTRATOR', 'The instance must keep an administrator');
    }
    await tx.update(users).set({ instanceRoleId: roleId }).where(eq(users.id, userId));
    log.info({ userId, roleId, by: actor.id }, 'Role changed');
  },
});
