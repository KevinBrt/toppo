import { canActOnRole } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { userIdParamsSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { roles, users } = schema;

/** Lets a deactivated account sign in again, with the role it had. */
export const reactivateUser = defineCommand({
  name: 'user.reactivate',
  access: { permission: 'instance.users.manage' },
  input: userIdParamsSchema,
  async handler({ tx, actor, log }, { userId }): Promise<void> {
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
    await tx.update(users).set({ deactivatedAt: null }).where(eq(users.id, userId));
    log.info({ userId, by: actor.id }, 'User reactivated');
  },
});
