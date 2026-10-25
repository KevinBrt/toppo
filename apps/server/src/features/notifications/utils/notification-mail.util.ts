import type { LinkedIssue, Locale, NotificationEvent } from '@toppo/shared';
import { composeMail } from '../../../platform/mail/mail-layout.ts';
import type { MailMessage } from '../../../platform/mail/mailer.ts';

interface NotificationMail {
  event: NotificationEvent;
  /** Who did it; `null` once their account is deleted. */
  actor: string | null;
  key: string;
  title: string;
  /** The status an issue was moved to. */
  status: string | null;
  /** Whom an issue was given to, told to another; `null` for no one. Its name is `null` once deleted. */
  assignee: { name: string | null } | null;
  /** The issue it was marked a duplicate of; `null` when the mark was taken off. */
  original: LinkedIssue | null;
  /** The words of the comment it is about, or of a new issue's description, if any. */
  quote: string | null;
  issueLink: URL;
  accountLink: URL;
}

/** A comment or a description is quoted up to this many characters: the rest is in Toppo. */
const QUOTE_LENGTH = 1000;

const WORDS = {
  en: {
    deletedUser: 'A deleted user',
    events: {
      created: ({ actor, key }: Sentence) => `${actor} created ${key}`,
      assigned: ({ actor, key }: Sentence) => `${actor} assigned you ${key}`,
      assigneeChanged: ({ actor, key, assignee }: Sentence) =>
        assignee === null
          ? `${actor} unassigned ${key}`
          : `${actor} assigned ${key} to ${assignee}`,
      commented: ({ actor, key }: Sentence) => `${actor} commented on ${key}`,
      mentioned: ({ actor, key }: Sentence) => `${actor} mentioned you in ${key}`,
      statusChanged: ({ actor, key, status }: Sentence) => `${actor} moved ${key} to “${status}”`,
      duplicateChanged: ({ actor, key, original }: Sentence) =>
        original
          ? `${actor} marked ${key} as a duplicate of ${original.key ?? 'an issue you cannot see'}`
          : `${actor} took the duplicate mark off ${key}`,
    },
    action: (key: string) => `Open ${key}`,
    footer: (accountLink: URL) =>
      `You receive this email because you take part in this issue. To stop notification emails, turn them off in your account: ${accountLink.href}`,
  },
  fr: {
    deletedUser: 'Un utilisateur supprimé',
    events: {
      created: ({ actor, key }: Sentence) => `${actor} a créé ${key}`,
      assigned: ({ actor, key }: Sentence) => `${actor} vous a assigné ${key}`,
      assigneeChanged: ({ actor, key, assignee }: Sentence) =>
        assignee === null
          ? `${actor} a retiré l’assignation de ${key}`
          : `${actor} a assigné ${key} à ${assignee}`,
      commented: ({ actor, key }: Sentence) => `${actor} a commenté ${key}`,
      mentioned: ({ actor, key }: Sentence) => `${actor} vous a mentionné dans ${key}`,
      statusChanged: ({ actor, key, status }: Sentence) =>
        `${actor} a passé ${key} à « ${status} »`,
      duplicateChanged: ({ actor, key, original }: Sentence) => {
        if (!original) {
          return `${actor} a retiré la marque de doublon de ${key}`;
        }
        const of = original.key ? `de ${original.key}` : 'd’un ticket que vous ne voyez pas';
        return `${actor} a marqué ${key} comme doublon ${of}`;
      },
    },
    action: (key: string) => `Ouvrir ${key}`,
    footer: (accountLink: URL) =>
      `Vous recevez cet e-mail parce que vous participez à ce ticket. Pour ne plus recevoir les notifications par e-mail, désactivez-les dans votre compte : ${accountLink.href}`,
  },
} as const satisfies Record<Locale, unknown>;

interface Sentence {
  actor: string;
  key: string;
  status: string;
  /** Whom the issue went to, by name; `null` for no one. */
  assignee: string | null;
  /** The issue it duplicates; `null` when the mark was taken off. */
  original: LinkedIssue | null;
}

/**
 * A notification as an email, in the language of its recipient: what happened as its subject
 * line says it in Toppo, the issue, the comment or description it is about, and the way to it.
 * Its subject is the issue's, so that mail clients thread the emails of one issue together.
 */
export function notificationMail(
  locale: Locale,
  mail: NotificationMail,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  const sentence = words.events[mail.event]({
    actor: mail.actor ?? words.deletedUser,
    key: mail.key,
    status: mail.status ?? '',
    assignee: mail.assignee ? (mail.assignee.name ?? words.deletedUser) : null,
    original: mail.original,
  });
  return composeMail({
    subject: `[${mail.key}] ${mail.title}`,
    heading: sentence,
    paragraphs: [`${mail.key} · ${mail.title}`, ...(mail.quote ? [excerpt(mail.quote)] : [])],
    action: { label: words.action(mail.key), url: mail.issueLink },
    footer: words.footer(mail.accountLink),
  });
}

function excerpt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= QUOTE_LENGTH ? trimmed : `${trimmed.slice(0, QUOTE_LENGTH).trimEnd()}…`;
}
