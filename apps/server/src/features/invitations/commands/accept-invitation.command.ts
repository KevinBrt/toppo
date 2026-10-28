import { isInvitationExpired } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { acceptInvitationRequestSchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { hashInvitationToken } from '../utils/invitation-token.util.ts';

const { accounts, invitationProjects, invitations, projectMembers, users } = schema;

/** Better Auth's provider id for email and password credentials. */
const CREDENTIAL_PROVIDER = 'credential';

/**
 * Creates the account an invitation is for, with the chosen name and password and the project
 * access the invitation gives, and uses the invitation up. The new member then signs in as
 * anyone does: no session is created here.
 */
export const acceptInvitation = defineCommand({
  name: 'invitation.accept',
  // Public: the token is the credential. Its route is rate limited.
  access: 'public',
  input: acceptInvitationRequestSchema,
  async handler(
    { tx, services, log },
    { token, name, password, locale },
  ): Promise<{ email: string }> {
    // Locked: two attempts with the same link are serialized, and the second finds it used.
    const [invitation] = await tx
      .select({
        id: invitations.id,
        email: invitations.email,
        roleId: invitations.roleId,
        allProjects: invitations.allProjects,
        expiresAt: invitations.expiresAt,
      })
      .from(invitations)
      .where(
        and(eq(invitations.tokenHash, hashInvitationToken(token)), isNull(invitations.acceptedAt)),
      )
      .for('update');
    if (!invitation) {
      throw new HttpError(404, 'INVITATION_INVALID', 'This invitation link is not valid');
    }
    if (isInvitationExpired(invitation.expiresAt, new Date())) {
      throw new HttpError(410, 'INVITATION_EXPIRED', 'This invitation link has expired');
    }
    const [member] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, invitation.email));
    if (member) {
      throw new HttpError(409, 'ALREADY_MEMBER', 'This address already belongs to a member');
    }

    // Only now, once the link is known to be good: an unknown link costs the server nothing.
    const passwordHash = await services.hashPassword(password);
    const userId = uuidv7();
    await tx.insert(users).values({
      id: userId,
      name,
      email: invitation.email,
      // The administrator typed this address; nobody has proved they read its mail.
      emailVerified: false,
      instanceRoleId: invitation.roleId,
      allProjects: invitation.allProjects,
      locale,
    });
    // The projects the invitation gives, those still there: archived ones keep their members too.
    const chosen = await tx
      .select({ projectId: invitationProjects.projectId })
      .from(invitationProjects)
      .where(eq(invitationProjects.invitationId, invitation.id));
    if (chosen.length > 0) {
      await tx
        .insert(projectMembers)
        .values(chosen.map(({ projectId }) => ({ projectId, userId })));
    }
    await tx.insert(accounts).values({
      accountId: userId,
      providerId: CREDENTIAL_PROVIDER,
      userId,
      password: passwordHash,
    });
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invitation.id));

    log.info({ userId, invitationId: invitation.id }, 'Invitation accepted');
    return { email: invitation.email };
  },
});
