import type { Locale } from '@toppo-tracker/shared';
import { composeMail } from '../../../platform/mail/mail-layout.ts';
import type { MailMessage } from '../../../platform/mail/mailer.ts';

const WORDS = {
  en: {
    subject: 'Toppo can send email',
    heading: 'Email works',
    body: (origin: string) =>
      `This message was sent by Toppo (${origin}) with the settings you saved. Invitations, password resets and notifications will leave the same way.`,
    action: 'Open Toppo',
    footer: 'You receive this message because you asked Toppo for a test email.',
  },
  fr: {
    subject: 'Toppo peut envoyer des emails',
    heading: 'L’email fonctionne',
    body: (origin: string) =>
      `Ce message a été envoyé par Toppo (${origin}) avec les réglages que vous avez enregistrés. Les invitations, les réinitialisations de mot de passe et les notifications partiront de la même façon.`,
    action: 'Ouvrir Toppo',
    footer: 'Vous recevez ce message parce que vous avez demandé à Toppo un email de test.',
  },
} as const satisfies Record<Locale, unknown>;

/** The test email, in the language of the administrator who asked for it. */
export function testMail(
  locale: Locale,
  publicUrl: URL,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  return composeMail({
    subject: words.subject,
    heading: words.heading,
    paragraphs: [words.body(publicUrl.origin)],
    action: { label: words.action, url: publicUrl },
    footer: words.footer,
  });
}
