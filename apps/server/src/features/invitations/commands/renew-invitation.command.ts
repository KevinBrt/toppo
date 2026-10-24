import { canActOnRole, invitationExpiry } from '@toppo/core';
import { schema } from '@toppo/db';
import { type InvitationLink, invitationIdParamsSchema } from '@toppo/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { emailInvitations } from '../jobs/email-invitation.job.ts';
import {
  hashInvitationToken,
  invitationLink,
  newInvitationToken,
} from '../utils/invitation-token.util.ts';

const { invitations, roles } = schema;

/**
 * Gives a pending invitation a new link, valid for another week; the previous link stops
 * working. The new one is emailed when email is set up. Returns the link, which exists only now.
 */
export const renewInvitation = defineCommand({
  name: 'invitation.renew',
  access: { permission: 'instance.users.manage' },
  input: invitationIdParamsSchema,
  async handler({ tx, actor, services, log }, { invitationId }): Promise<InvitationLink> {
    const [invitation] = await tx
      .select({ email: invitations.email, grantsAll: roles.grantsAll })
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
    const token = newInvitationToken();
    await tx
      .update(invitations)
      .set({ tokenHash: hashInvitationToken(token), expiresAt: invitationExpiry(new Date()) })
      .where(eq(invitations.id, invitationId));
    const emailed = await emailInvitations(tx, services, [{ id: invitationId, token }]);
    log.info({ invitationId, emailed, by: actor.id }, 'Invitation renewed');
    return {
      id: invitationId,
      email: invitation.email,
      link: invitationLink(services.publicUrl, token),
      emailed,
    };
  },
});
