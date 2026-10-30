import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { HostCrypto } from '@toppo-tracker/plugin-sdk/host';
import type { HmacKey } from '@toppo-tracker/plugin-sdk/protocol';

/** Base64 as it is written once decoded, without its padding: a key's text compared with it. */
const unpadded = (base64: string) => base64.replace(/=+$/u, '');

/**
 * A key's bytes. One given in base64 must be base64 indeed, of a byte at least: decoded leniently,
 * a key mistyped would become an empty one, with which anyone signs.
 */
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

/**
 * Node's cryptography, as Toppo lends it to plugins' sandboxes and signs its own webhooks with:
 * the signatures themselves are written once, by the SDK (`signedHeaders`, `verifySignature`).
 */
export const nodeCrypto: HostCrypto = {
  hmac: (algorithm, key, data, encoding) =>
    createHmac(algorithm, keyOf(key)).update(data).digest(encoding),
  // Their digests compared: the time taken tells neither where the texts differ, nor their lengths.
  equal: (a, b) => timingSafeEqual(digestOf(a), digestOf(b)),
};
