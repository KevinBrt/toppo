import type { Locale } from '@toppo-tracker/shared';
import { composeMail } from '../../../platform/mail/mail-layout.ts';
import type { MailMessage } from '../../../platform/mail/mailer.ts';
import { FAILURES_BEFORE_DISABLING, type PluginFailure } from '../models/plugin-failure.model.ts';

interface PluginDisabledMail {
  /** "Time tracking". */
  plugin: string;
  failure: PluginFailure;
  /** Where plugins are managed. */
  link: URL;
}

const WORDS = {
  en: {
    subject: ({ plugin }: PluginDisabledMail) => `Toppo stopped the plugin ${plugin}`,
    heading: 'A plugin was stopped',
    stopped: ({ plugin }: PluginDisabledMail) =>
      `${plugin} failed ${FAILURES_BEFORE_DISABLING} times in a row, so Toppo disabled it: it does nothing until an administrator enables it again.`,
    failures: {
      LOAD_FAILED: 'its code fails as it loads',
      TIMEOUT: 'it took too long to answer',
      OUT_OF_MEMORY: 'it ran out of memory',
      PLUGIN_ERROR: 'its code threw an error',
      INVALID_ANSWER: 'it answered something Toppo does not understand',
      CRASHED: 'its sandbox stopped',
      ANSWERED_ERROR: 'it answered that it could not do what it was asked',
    } satisfies Record<PluginFailure, string>,
    last: (failure: string) => `The last time, ${failure}. The server's log tells more.`,
    action: 'See the plugins',
    footer: 'You receive this email because you manage the plugins of this Toppo instance.',
  },
  fr: {
    subject: ({ plugin }: PluginDisabledMail) => `Toppo a arrêté le plugin ${plugin}`,
    heading: 'Un plugin a été arrêté',
    stopped: ({ plugin }: PluginDisabledMail) =>
      `${plugin} a échoué ${FAILURES_BEFORE_DISABLING} fois de suite : Toppo l’a désactivé. Il ne fait plus rien tant qu’un administrateur ne l’active pas de nouveau.`,
    failures: {
      LOAD_FAILED: 'son code échoue au chargement',
      TIMEOUT: 'il a mis trop de temps à répondre',
      OUT_OF_MEMORY: 'il a manqué de mémoire',
      PLUGIN_ERROR: 'son code a levé une erreur',
      INVALID_ANSWER: 'il a répondu quelque chose que Toppo ne comprend pas',
      CRASHED: 'son bac à sable s’est arrêté',
      ANSWERED_ERROR: 'il a répondu ne pas pouvoir faire ce qui lui était demandé',
    } satisfies Record<PluginFailure, string>,
    last: (failure: string) => `La dernière fois, ${failure}. Le journal du serveur en dit plus.`,
    action: 'Voir les plugins',
    footer: 'Vous recevez cet e-mail parce que vous gérez les plugins de cette instance Toppo.',
  },
} as const satisfies Record<Locale, unknown>;

/** Tells someone who manages plugins that one was disabled, in their language. */
export function pluginDisabledMail(
  locale: Locale,
  mail: PluginDisabledMail,
): Pick<MailMessage, 'subject' | 'text' | 'html'> {
  const words = WORDS[locale];
  return composeMail({
    subject: words.subject(mail),
    heading: words.heading,
    paragraphs: [words.stopped(mail), words.last(words.failures[mail.failure])],
    action: { label: words.action, url: mail.link },
    footer: words.footer,
  });
}
