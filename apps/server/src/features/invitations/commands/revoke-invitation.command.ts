import { canActOnRole } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { invitationIdParamsSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { invitations, roles } = schema;

/** Withdraws a pending invitation: its link stops working at once. */
export const revokeInvitation = defineCommand({
  name: 'invitation.revoke',
  access: { permission: 'instance.users.manage' },
  input: invitationIdParamsSchema,
  async handler({ tx, actor, log }, { invitationId }): Promise<void> {
    const [invitation] = await tx
      .select({ grantsAll: roles.grantsAll })
      .from(invitations)
      .innerJoin(roles, eq(roles.id, invitations.roleId))
      .where(and(eq(invitations.id, invitationId), isNull(invitations.acceptedAt)))
      .for('update', { of: invitations });
    if (!invitation) {
      throw new HttpError(404, 'INVITATION_NOT_FOUND', 'This invitation does not exist');
    }
    if (!canActOnRole(actor.permissions, invitation)) {
      throw new HttpError(403, 'SYSTEM_ROLE_RESERVED', 'Only administrators handle that role');
    }
    await tx.delete(invitations).where(eq(invitations.id, invitationId));
    log.info({ invitationId, by: actor.id }, 'Invitation revoked');
  },
});
