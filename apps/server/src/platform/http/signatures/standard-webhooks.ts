import { randomBytes } from 'node:crypto';

/**
 * Keys of signed requests as the Standard Webhooks specification writes them (standardwebhooks.com),
 * so that whoever receives Toppo's webhooks checks them with a library of their language's. The
 * signatures themselves are the SDK's (`signedHeaders`, `verifySignature`), which plugins' routes
 * check too.
 */

const SECRET_PREFIX = 'whsec_';
const SECRET_BYTES = 32;

/** A new signing key: `whsec_` and 32 random bytes, base64. */
export function newWebhookSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(SECRET_BYTES).toString('base64')}`;
}
