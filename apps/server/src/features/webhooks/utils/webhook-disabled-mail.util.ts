import { type Locale, WEBHOOK_FAILURES_BEFORE_DISABLING } from '@toppo-tracker/shared';
import { composeMail } from '../../../platform/mail/mail-layout.ts';
import type { MailMessage } from '../../../platform/mail/mailer.ts';

interface WebhookDisabledMail {
  /** As the administrators named it. */
  webhook: string;
  /** Why its last delivery was given up: a failure's code, or `HTTP_<status>`. */
  lastError: string;
  /** Where webhooks are managed. */
  link: URL;
}

const WORDS = {
  en: {
    subject: ({ webhook }: WebhookDisabledMail) => `Toppo stopped the webhook ${webhook}`,
    heading: 'A webhook was stopped',
    stopped: ({ webhook }: WebhookDisabledMail) =>
      `Toppo gave up ${WEBHOOK_FAILURES_BEFORE_DISABLING} deliveries in a row to ${webhook}, so it disabled it: nothing is sent to it until an administrator enables it again.`,
    last: (why: string) => `The last time, ${why}.`,
    failures: {
      ADDRESS_NOT_ALLOWED: 'its address lies inside the network, which it may not reach',
      TIMEOUT: 'it did not answer within 10 seconds',
      RESPONSE_TOO_LARGE: 'it answered more than Toppo reads',
      TOO_MANY_REDIRECTS: 'it answered with a redirect, which Toppo does not follow',
      NETWORK_ERROR: 'it could not be reached',
      SECRET_UNREADABLE: 'its key could not be read: the instance’s own key changed',
    } as Readonly<Record<string, string>>,
    answered: (status: string) => `it answered ${status}`,
    action: 'See the webhooks',
    footer: 'You receive this email because you manage the webhooks of this Toppo instance.',
  },
  fr: {
    subject: ({ webhook }: WebhookDisabledMail) => `Toppo a arrêté le webhook ${webhook}`,
    heading: 'Un webhook a été arrêté',
    stopped: ({ webhook }: WebhookDisabledMail) =>
      `Toppo a abandonné ${WEBHOOK_FAILURES_BEFORE_DISABLING} envois de suite vers ${webhook} : il l’a désactivé. Plus rien ne lui est envoyé tant qu’un administrateur ne l’active pas de nouveau.`,
    last: (why: string) => `La dernière fois, ${why}.`,
    failures: {
      ADDRESS_NOT_ALLOWED: 'son adresse est dans le réseau interne, qu’il ne peut pas joindre',
      TIMEOUT: 'il n’a pas répondu en 10 secondes',
      RESPONSE_TOO_LARGE: 'il a répondu plus que Toppo ne lit',
      TOO_MANY_REDIRECTS: 'il a répondu par une redirection, que Toppo ne suit pas',
      NETWORK_ERROR: 'il n’a pas pu être joint',
      SECRET_UNREADABLE: 'sa clé n’a pas pu être lue : la clé de l’instance a changé',
    } as Readonly<Record<string, string>>,
    answered: (status: string) => `il a répondu ${status}`,
    action: 'Voir les webhooks',
    footer: 'Vous recevez cet e-mail parce que vous gérez les webhooks de cette instance Toppo.',
  },
} as const satisfies Record<Locale, unknown>;

/** Why a delivery was given up, in words: `HTTP_503` reads "it answered 503". */
function whyOf(words: (typeof WORDS)[Locale], lastError: string): string {
  const status = /^HTTP_(\d{3})$/.exec(lastError)?.[1];
  return status ? words.answered(status) : (words.failures[lastError] ?? lastError);
}

/** Tells someone who manages webhooks that one was disabled, in their language. */
export function webhookDisabledMail(
  locale: Locale,
  mail: WebhookDisabledMail,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  return composeMail({
    subject: words.subject(mail),
    heading: words.heading,
    paragraphs: [words.stopped(mail), words.last(whyOf(words, mail.lastError))],
    action: { label: words.action, url: mail.link },
    footer: words.footer,
  });
}
