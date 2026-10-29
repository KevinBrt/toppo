import { createHmac, timingSafeEqual } from 'node:crypto';
import type { HostCrypto } from '@toppo-tracker/plugin-sdk/host';

/**
 * Node's cryptography, as Toppo lends it to plugins' sandboxes and signs its own webhooks with:
 * the signatures themselves are written once, by the SDK (`signedHeaders`, `verifySignature`).
 */
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
