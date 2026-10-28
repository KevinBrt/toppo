import { schema } from '@toppo-tracker/db';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Services, Transaction } from '../../../platform/cqrs/cqrs.ts';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { invitationMail } from '../utils/invitation-mail.util.ts';
import { hashInvitationToken, invitationLink } from '../utils/invitation-token.util.ts';

const { invitations, users } = schema;

/**
 * Emails an invitation its link. The token is sealed in the job: none lies in clear in the
 * queue. A link replaced, accepted or expired meanwhile is not sent.
 */
export const emailInvitationJob = defineJob({
  type: 'invitation.email',
  // Someone is waiting for it, unlike a notification.
  priority: 1,
  payload: z.object({ invitationId: z.uuid(), sealedToken: z.string() }),
  async handler({ tx, services, log }, { invitationId, sealedToken }) {
    const token = services.secrets.open(sealedToken);
    if (token === null) {
      log.warn({ invitationId }, 'Invitation sealed with another instance key: not emailed');
      return;
    }
    const [invitation] = await tx
      .select({ email: invitations.email, inviter: users.name, locale: users.locale })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.invitedById))
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.tokenHash, hashInvitationToken(token)),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, sql`now()`),
        ),
      );
    if (!(invitation && (await services.mailer.isConfigured(tx)))) {
      log.info({ invitationId }, 'Invitation no longer to email');
      return;
    }
    const { email, inviter, locale } = invitation;
    await services.mailer.send(tx, {
      to: { name: '', address: email },
      ...invitationMail(locale, {
        inviter,
        email,
        link: new URL(invitationLink(services.publicUrl, token)),
      }),
    });
    log.info({ invitationId }, 'Invitation emailed');
  },
});

/**
 * Queues the email of each invitation, if email is set up: whether it is tells the inviter that
 * the link is on its way, or to be passed on by hand.
 */
export async function emailInvitations(
  tx: Transaction,
  services: Services,
  invited: readonly { id: string; token: string }[],
): Promise<boolean> {
  if (!(await services.mailer.isConfigured(tx))) {
    return false;
  }
  for (const { id, token } of invited) {
    await enqueue(tx, emailInvitationJob, {
      invitationId: id,
      sealedToken: services.secrets.seal(token),
    });
  }
  return true;
}
