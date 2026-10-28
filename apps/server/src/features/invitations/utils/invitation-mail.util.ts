import { INVITATION_LIFETIME_DAYS } from '@toppo-tracker/core';
import type { Locale } from '@toppo-tracker/shared';
import { composeMail } from '../../../platform/mail/mail-layout.ts';
import type { MailMessage } from '../../../platform/mail/mailer.ts';

interface InvitationMail {
  /** Who invites, as others see them. */
  inviter: string;
  email: string;
  link: URL;
}

const WORDS = {
  en: {
    subject: ({ inviter }: InvitationMail) => `${inviter} invited you to Toppo`,
    heading: 'Join Toppo',
    invited: ({ inviter, link }: InvitationMail) =>
      `${inviter} invited you to work with them on Toppo, at ${link.origin}.`,
    how: `Choose your name and password to create your account. The link works once, for ${INVITATION_LIFETIME_DAYS} days.`,
    action: 'Accept the invitation',
    footer: ({ inviter, email }: InvitationMail) =>
      `You receive this email because ${inviter} invited ${email}. If you did not expect it, ignore it: nothing happens without you.`,
  },
  fr: {
    subject: ({ inviter }: InvitationMail) => `${inviter} vous invite sur Toppo`,
    heading: 'Rejoindre Toppo',
    invited: ({ inviter, link }: InvitationMail) =>
      `${inviter} vous invite à travailler sur Toppo, à l’adresse ${link.origin}.`,
    how: `Choisissez votre nom et votre mot de passe pour créer votre compte. Le lien fonctionne une seule fois, pendant ${INVITATION_LIFETIME_DAYS} jours.`,
    action: 'Accepter l’invitation',
    footer: ({ inviter, email }: InvitationMail) =>
      `Vous recevez cet email parce que ${inviter} a invité ${email}. Si vous ne vous y attendiez pas, ignorez-le : rien ne se passe sans vous.`,
  },
} as const satisfies Record<Locale, unknown>;

/** The invitation, in the language of the administrator who sent it. */
export function invitationMail(
  locale: Locale,
  invitation: InvitationMail,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  return composeMail({
    subject: words.subject(invitation),
    heading: words.heading,
    paragraphs: [words.invited(invitation), words.how],
    action: { label: words.action, url: invitation.link },
    footer: words.footer(invitation),
  });
}
