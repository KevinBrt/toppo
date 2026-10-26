import { schema } from '@toppo/db';
import { DEFAULT_LOCALE } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { MailError, type MailFailure } from '../../../platform/mail/mailer.ts';
import { testMail } from '../utils/test-mail.util.ts';

const { users } = schema;

/** What the administrator is told, by code: the web app says it in their language. */
const REFUSALS: Readonly<Record<MailFailure, [status: number, code: string]>> = {
  notConfigured: [409, 'MAIL_NOT_CONFIGURED'],
  passwordUnreadable: [409, 'MAIL_PASSWORD_UNREADABLE'],
  authentication: [422, 'MAIL_AUTHENTICATION_FAILED'],
  connection: [422, 'MAIL_CONNECTION_FAILED'],
  tls: [422, 'MAIL_TLS_FAILED'],
  rejected: [422, 'MAIL_REJECTED'],
};

/**
 * Sends a test email to the administrator's own address, with the settings saved. Unlike every
 * other email it leaves during the request, not from the job queue: its whole point is to tell
 * the administrator, there and then, whether the mail server takes it, and if not, why.
 */
export const sendTestMail = defineCommand({
  name: 'mail.sendTest',
  access: { permission: 'instance.mail.manage' },
  input: z.object({}),
  async handler({ tx, actor, services, log }): Promise<void> {
    const [me] = await tx
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, actor.id));
    try {
      await services.mailer.send(tx, {
        to: { name: actor.name, address: actor.email },
        ...testMail(me?.locale ?? DEFAULT_LOCALE, services.publicUrl),
      });
    } catch (error) {
      if (!(error instanceof MailError)) {
        throw error;
      }
      // The server's own words stay in the log: the administrator reads them there if need be.
      log.warn({ err: error, reason: error.reason, by: actor.id }, 'Test email failed');
      const [status, code] = REFUSALS[error.reason];
      throw new HttpError(status, code, 'The mail server did not take the test email');
    }
    log.info({ by: actor.id }, 'Test email sent');
  },
});
