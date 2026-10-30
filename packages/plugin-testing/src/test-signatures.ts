import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SignatureCheck } from '@toppo-tracker/plugin-sdk';
import { type HostCrypto, signedHeaders } from '@toppo-tracker/plugin-sdk/host';
import type { HmacKey } from '@toppo-tracker/plugin-sdk/protocol';

/** Base64 as it is written once decoded, without its padding: a key's text compared with it. */
const unpadded = (base64: string) => base64.replace(/=+$/u, '');

/** A key's bytes, refused as Toppo refuses it: one given in base64 must be base64 indeed. */
function keyOf(key: HmacKey): string | Buffer {
  if (typeof key === 'string') {
    return key;
  }
  const bytes = Buffer.from(key.base64, 'base64');
  if (bytes.length === 0 || unpadded(bytes.toString('base64')) !== unpadded(key.base64)) {
    throw new Error('The key is not base64');
  }
  return bytes;
}

/** A text's SHA-256: of one length, whatever the text's. */
const digestOf = (text: string) => createHash('sha256').update(text).digest();

/** Node's cryptography, as Toppo lends it to a plugin's sandbox. */
export const nodeCrypto: HostCrypto = {
  hmac: (algorithm, key, data, encoding) =>
    createHmac(algorithm, keyOf(key)).update(data).digest(encoding),
  equal: (a, b) => timingSafeEqual(digestOf(a), digestOf(b)),
};

/** A request a route receives in a test: its headers (lowercase names), query and body. */
export interface TestRouteRequest {
  headers?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, string>>;
  body?: string;
}

/**
 * A request signed as a service signs it, for a route's tests: the headers `check` says, and the
 * body, as text (JSON when an object is given). Standard Webhooks' are dated now.
 */
export function signed(check: SignatureCheck, body: string | object): TestRouteRequest {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    headers: signedHeaders(nodeCrypto, check, text, {
      id: `msg_${randomUUID()}`,
      timestamp: Math.floor(Date.now() / 1000),
    }),
    body: text,
  };
}
