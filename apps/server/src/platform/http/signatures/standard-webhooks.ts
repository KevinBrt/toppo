import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Signed requests as the Standard Webhooks specification writes them (standardwebhooks.com), so
 * that whoever receives Toppo's webhooks checks them with a library of their language's: an HMAC
 * SHA-256 of `id.timestamp.body`, under a key Toppo generates, in three headers.
 */

const SECRET_PREFIX = 'whsec_';
const SECRET_BYTES = 32;
/** How old a timestamp may be, or how far ahead: a request replayed later is refused. */
const TOLERANCE_SECONDS = 5 * 60;

/** A new signing key: `whsec_` and 32 random bytes, base64. */
export function newWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64')}`;
}

function keyOf(secret: string): Buffer {
  return Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    'base64',
  );
}

function signatureOf(secret: string, id: string, timestamp: number, body: string): string {
  return createHmac('sha256', keyOf(secret)).update(`${id}.${timestamp}.${body}`).digest('base64');
}

/** The headers that sign `body`, sent as message `id` at `timestamp` (seconds since 1970). */
export function signWebhook(
  secret: string,
  { id, timestamp, body }: { id: string; timestamp: number; body: string },
): Record<'webhook-id' | 'webhook-timestamp' | 'webhook-signature', string> {
  return {
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signatureOf(secret, id, timestamp, body)}`,
  };
}

/**
 * Whether `body` was signed with `secret`, within five minutes of `now` (seconds): the received
 * signatures compared in constant time, any one of them matching (a key being changed sends two).
 */
export function verifyWebhook(
  secret: string,
  headers: Readonly<Record<string, string | undefined>>,
  body: string,
  now: number,
): boolean {
  const id = headers['webhook-id'];
  const timestamp = Number(headers['webhook-timestamp']);
  const signatures = headers['webhook-signature'];
  if (!(id && signatures && Number.isInteger(timestamp))) {
    return false;
  }
  if (Math.abs(now - timestamp) > TOLERANCE_SECONDS) {
    return false;
  }
  const expected = Buffer.from(signatureOf(secret, id, timestamp, body), 'base64');
  return signatures.split(' ').some((signed) => {
    const [version, value] = signed.split(',');
    const received = Buffer.from(value ?? '', 'base64');
    return (
      version === 'v1' && received.length === expected.length && timingSafeEqual(received, expected)
    );
  });
}
