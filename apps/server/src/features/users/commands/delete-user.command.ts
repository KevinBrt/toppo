import { canActOnRole, keepsAnAdministrator } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { userIdParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { lockInstanceAccounts } from '../../../platform/auth/administrators.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { accounts, projectMembers, sessions, users } = schema;

/** Reserved for documentation and tests (RFC 2606): an erased address can never reach anyone. */
const ERASED_EMAIL_DOMAIN = 'deleted.invalid';

/**
 * Erases a member for good: name, address, password, sessions and project access. The row stays,
 * deactivated, so that history keeps an author ("Deleted user"), and the address becomes free
 * for a new invitation. Irreversible: deactivation is the way to keep an account for later.
 */
export const deleteUser = defineCommand({
  name: 'user.delete',
  access: { permission: 'instance.users.manage' },
  input: userIdParamsSchema,
  async handler({ tx, actor, log }, { userId }): Promise<void> {
    if (userId === actor.id) {
      throw new HttpError(409, 'CANNOT_DELETE_SELF', 'You cannot delete your own account');
    }
    const instance = await lockInstanceAccounts(tx, userId);
    const user = instance.users.find((candidate) => candidate.id === userId);
    if (!user) {
      throw new HttpError(404, 'USER_NOT_FOUND', 'This user does not exist');
    }
    const role = instance.roles.find((candidate) => candidate.id === user.roleId);
    if (!(role && canActOnRole(actor.permissions, role))) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    if (!keepsAnAdministrator(instance, { type: 'deactivate', userId })) {
      throw new HttpError(409, 'LAST_ADMINISTRATOR', 'The instance must keep an administrator');
    }

    const now = new Date();
    await tx
      .update(users)
      .set({
        name: '',
        email: `deleted-${userId}@${ERASED_EMAIL_DOMAIN}`,
        emailVerified: false,
        image: null,
        allProjects: false,
        // A deactivated account keeps the date it stopped.
        ...(user.active ? { deactivatedAt: now } : {}),
        deletedAt: now,
      })
      .where(eq(users.id, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(projectMembers).where(eq(projectMembers.userId, userId));
    log.info({ userId, by: actor.id }, 'User deleted');
  },
});
