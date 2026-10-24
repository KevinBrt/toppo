import { schema } from '@toppo/db';
import { type Locale, PASSWORD_RESET_LIFETIME_MINUTES } from '@toppo/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineJob } from '../jobs/jobs.ts';
import { composeMail } from '../mail/mail-layout.ts';
import type { MailMessage } from '../mail/mailer.ts';

const { users } = schema;

interface ResetMail {
  email: string;
  link: URL;
}

const WORDS = {
  en: {
    subject: 'Choose a new Toppo password',
    heading: 'Choose a new password',
    asked: ({ email, link }: ResetMail) =>
      `Someone, probably you, asked for a new password for ${email} on Toppo (${link.origin}).`,
    how: `The link works once, for ${PASSWORD_RESET_LIFETIME_MINUTES} minutes. Your password stays the same until you choose a new one, and every device is then signed out.`,
    action: 'Choose a new password',
    footer: 'If you did not ask for it, ignore this email: nothing changes.',
  },
  fr: {
    subject: 'Choisissez un nouveau mot de passe Toppo',
    heading: 'Choisir un nouveau mot de passe',
    asked: ({ email, link }: ResetMail) =>
      `Quelqu’un, sans doute vous, a demandé un nouveau mot de passe pour ${email} sur Toppo (${link.origin}).`,
    how: `Le lien fonctionne une seule fois, pendant ${PASSWORD_RESET_LIFETIME_MINUTES} minutes. Votre mot de passe reste le même tant que vous n’en choisissez pas un nouveau ; tous vos appareils sont alors déconnectés.`,
    action: 'Choisir un nouveau mot de passe',
    footer: 'Si vous ne l’avez pas demandé, ignorez cet e-mail : rien ne change.',
  },
} as const satisfies Record<Locale, unknown>;

/** The email with the link to choose a new password, in the language of its recipient. */
export function passwordResetMail(
  locale: Locale,
  mail: ResetMail,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  return composeMail({
    subject: words.subject,
    heading: words.heading,
    paragraphs: [words.asked(mail), words.how],
    action: { label: words.action, url: mail.link },
    footer: words.footer,
  });
}

/**
 * Emails the link to choose a new password, queued by Better Auth when someone asks for it. The
 * token is sealed in the job; the link puts it after `#`, so it never reaches a server log. An
 * account deactivated or deleted meanwhile gets nothing.
 */
export const passwordResetMailJob = defineJob({
  type: 'password-reset.email',
  payload: z.object({ userId: z.uuid(), sealedToken: z.string() }),
  async handler({ tx, services, log }, { userId, sealedToken }) {
    const token = services.secrets.open(sealedToken);
    if (token === null) {
      log.warn({ userId }, 'Password reset sealed with another instance key: not emailed');
      return;
    }
    const [user] = await tx
      .select({ name: users.name, email: users.email, locale: users.locale })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deactivatedAt), isNull(users.deletedAt)));
    if (!(user && (await services.mailer.isConfigured(tx)))) {
      log.info({ userId }, 'Password reset no longer to email');
      return;
    }
    const link = new URL('/reset-password', services.publicUrl);
    link.hash = token;
    await services.mailer.send(tx, {
      to: { name: user.name, address: user.email },
      ...passwordResetMail(user.locale, { email: user.email, link }),
    });
    log.info({ userId }, 'Password reset emailed');
  },
});
