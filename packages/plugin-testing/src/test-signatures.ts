import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { SignatureCheck } from '@toppo-tracker/plugin-sdk';
import { type HostCrypto, signedHeaders } from '@toppo-tracker/plugin-sdk/host';

/** Node's cryptography, as Toppo lends it to a plugin's sandbox. */
export const nodeCrypto: HostCrypto = {
  hmac: (algorithm, key, data, encoding) =>
    createHmac(algorithm, typeof key === 'string' ? key : Buffer.from(key.base64, 'base64'))
      .update(data)
      .digest(encoding),
  equal(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  },
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
