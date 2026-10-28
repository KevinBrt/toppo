import { canActOnRole, keepsAnAdministrator } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { userIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { lockInstanceAccounts } from '../../../platform/auth/administrators.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { sessions, users } = schema;

/**
 * Stops an account at once: its sessions are deleted and it can no longer sign in. Nothing else
 * is lost; the account comes back with `user.reactivate`.
 */
export const deactivateUser = defineCommand({
  name: 'user.deactivate',
  access: { permission: 'instance.users.manage' },
  input: userIdParamsSchema,
  async handler({ tx, actor, log }, { userId }): Promise<void> {
    if (userId === actor.id) {
      throw new HttpError(409, 'CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
    }
    const accounts = await lockInstanceAccounts(tx, userId);
    const user = accounts.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'This user does not exist');
    }
    const role = accounts.roles.find((candidate) => candidate.id === user.roleId);
    if (!(role && canActOnRole(actor.permissions, role))) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    if (!user.active) {
      return;
    }
    if (!keepsAnAdministrator(accounts, { type: 'deactivate', userId })) {
      throw new HttpError(409, 'LAST_ADMINISTRATOR', 'The instance must keep an administrator');
    }
    await tx.update(users).set({ deactivatedAt: new Date() }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    log.info({ userId, by: actor.id }, 'User deactivated');
  },
});
