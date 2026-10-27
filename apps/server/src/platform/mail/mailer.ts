import { type Db, schema } from '@toppo/db';
import { createTransport } from 'nodemailer';
import type { SecretBox } from '../config/secret-box.ts';

const { mailSettings } = schema;

/** A message as a feature writes it: one recipient, its words in plain text and in HTML. */
export interface MailMessage {
  to: { name: string; address: string };
  subject: string;
  text: string;
  html: string;
}

/** Why a message could not leave, as the administrator testing the settings is told. */
export type MailFailure =
  | 'notConfigured'
  | 'passwordUnreadable'
  | 'authentication'
  | 'connection'
  | 'tls'
  | 'rejected';

export class MailError extends Error {
  readonly reason: MailFailure;

  constructor(reason: MailFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'MailError';
    this.reason = reason;
  }
}

/** Sends the instance's email, with the settings saved by an administrator. */
export interface Mailer {
  /** Whether email is set up: without it, features send nothing and say so. */
  isConfigured(db: Pick<Db, 'select'>): Promise<boolean>;
  /** Sends one message, the settings read through `db`. Throws `MailError` when it cannot. */
  send(db: Pick<Db, 'select'>, message: MailMessage): Promise<void>;
}

/** A server that does not answer must not hold a job, or an administrator's test, for long. */
const TIMEOUTS = { connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 30_000 };

/**
 * However the server answers, a message leaves within this time or not at all: one that answers a
 * byte now and then would otherwise keep each of the timeouts above from ever running out.
 */
const SEND_DEADLINE_MS = 45_000;

/** What the error codes of Nodemailer mean for the administrator. */
const FAILURES: Readonly<Record<string, MailFailure>> = {
  EAUTH: 'authentication',
  ETLS: 'tls',
  EREQUIRETLS: 'tls',
  ECONNECTION: 'connection',
  ETIMEDOUT: 'connection',
  ESOCKET: 'connection',
  EDNS: 'connection',
  EPROTOCOL: 'connection',
  EENVELOPE: 'rejected',
  EMESSAGE: 'rejected',
};

export function createMailer(secrets: SecretBox, { deadlineMs = SEND_DEADLINE_MS } = {}): Mailer {
  return {
    async isConfigured(db) {
      const [row] = await db.select({ id: mailSettings.id }).from(mailSettings);
      return row !== undefined;
    },
    async send(db, message) {
      const [settings] = await db.select().from(mailSettings);
      if (!settings) {
        throw new MailError('notConfigured', 'Email is not set up');
      }
      const password =
        settings.passwordSealed === null ? null : secrets.open(settings.passwordSealed);
      if (settings.passwordSealed !== null && password === null) {
        throw new MailError(
          'passwordUnreadable',
          'The mail password was sealed with another instance key: enter it again',
        );
      }
      const transport = createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.security === 'tls',
        requireTLS: settings.security === 'starttls',
        ignoreTLS: settings.security === 'none',
        ...(settings.username !== null && password !== null
          ? { auth: { user: settings.username, pass: password } }
          : {}),
        ...TIMEOUTS,
        // Messages carry words only: never a file of the server or a URL fetched for them.
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      let deadline: NodeJS.Timeout | undefined;
      const tooLong = new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => {
          transport.close();
          reject(new MailError('connection', 'The mail server took too long to take the message'));
        }, deadlineMs);
      });
      try {
        await Promise.race([
          transport.sendMail({
            from: { name: settings.fromName, address: settings.fromAddress },
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
          }),
          tooLong,
        ]);
      } catch (error) {
        throw asMailError(error);
      } finally {
        clearTimeout(deadline);
        transport.close();
      }
    },
  };
}

/** A failure of the mail server as a `MailError`; anything else is a bug, thrown as it is. */
function asMailError(error: unknown): unknown {
  const code = error instanceof Error ? Reflect.get(error, 'code') : undefined;
  const failure = typeof code === 'string' ? FAILURES[code] : undefined;
  if (!(error instanceof Error && failure)) {
    return error;
  }
  // A certificate refused shows as a socket error.
  const reason = /certificate/iu.test(error.message) ? 'tls' : failure;
  return new MailError(reason, error.message, { cause: error });
}
