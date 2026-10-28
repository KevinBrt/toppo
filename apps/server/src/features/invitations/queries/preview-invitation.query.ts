import { isInvitationExpired } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { type InvitationPreview, invitationPreviewRequestSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { hashInvitationToken } from '../utils/invitation-token.util.ts';

const { invitations, users } = schema;

/** What the person opening an invitation link sees before choosing a password. */
export const previewInvitation = defineQuery({
  name: 'invitation.preview',
  // Public: the token is the credential. Its route is rate limited.
  access: 'public',
  input: invitationPreviewRequestSchema,
  async handler({ db }, { token }): Promise<InvitationPreview> {
    const [invitation] = await db
      .select({
        email: invitations.email,
        expiresAt: invitations.expiresAt,
        invitedBy: users.name,
        inviterDeletedAt: users.deletedAt,
      })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.invitedById))
      .where(
        and(eq(invitations.tokenHash, hashInvitationToken(token)), isNull(invitations.acceptedAt)),
      );
    if (!invitation) {
      throw new HttpError(404, 'INVITATION_INVALID', 'This invitation link is not valid');
    }
    if (isInvitationExpired(invitation.expiresAt, new Date())) {
      throw new HttpError(410, 'INVITATION_EXPIRED', 'This invitation link has expired');
    }
    return {
      email: invitation.email,
      invitedBy: invitation.inviterDeletedAt ? null : invitation.invitedBy,
    };
  },
});
