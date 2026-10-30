import { createHmac } from 'node:crypto';
import { signedHeaders, verifySignature } from '@toppo-tracker/plugin-sdk/host';
import { describe, expect, it } from 'vitest';
import { nodeCrypto } from './node-crypto.ts';
import { newWebhookSecret } from './standard-webhooks.ts';

const NOW = 1_793_299_743;
const BODY = '{"type":"issue.created"}';

describe('the signatures Toppo writes and checks', () => {
  it('makes keys of 32 random bytes, as Standard Webhooks writes them', () => {
    const secret = newWebhookSecret();

    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
    expect(Buffer.from(secret.slice('whsec_'.length), 'base64')).toHaveLength(32);
    expect(newWebhookSecret()).not.toBe(secret);
  });

  it('signs as the specification signs its example', () => {
    // github.com/standard-webhooks/standard-webhooks, the specification's example.
    const headers = signedHeaders(
      nodeCrypto,
      { scheme: 'standard-webhooks', secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw' },
      '{"test": 2432232314}',
      { id: 'msg_p5jXN8AQM9LWM0D4loKWxJek', timestamp: 1614265330 },
    );

    expect(headers['webhook-signature']).toBe('v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=');
  });

  it('checks GitHub’s as its documentation signs its example', () => {
    // docs.github.com, "Validating webhook deliveries".
    const request = {
      headers: {
        'x-hub-signature-256':
          'sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17',
      },
      body: 'Hello, World!',
    };

    expect(
      verifySignature(
        nodeCrypto,
        request,
        { scheme: 'github', secret: "It's a Secret to Everybody" },
        NOW,
      ),
    ).toBe(true);
  });

  it('checks a request it signed, with its own key only, its body unchanged', () => {
    const secret = newWebhookSecret();
    const check = { scheme: 'standard-webhooks', secret } as const;
    const headers = signedHeaders(nodeCrypto, check, BODY, { id: 'msg_1', timestamp: NOW });

    expect(verifySignature(nodeCrypto, { headers, body: BODY }, check, NOW)).toBe(true);
    expect(verifySignature(nodeCrypto, { headers, body: `${BODY} ` }, check, NOW)).toBe(false);
    expect(
      verifySignature(
        nodeCrypto,
        { headers, body: BODY },
        { ...check, secret: newWebhookSecret() },
        NOW,
      ),
    ).toBe(false);
  });

  it('refuses a key that is not base64, which would sign with no key at all', () => {
    // What anyone can sign: with an empty key.
    const forged = createHmac('sha256', Buffer.alloc(0))
      .update(`msg_1.${NOW}.${BODY}`)
      .digest('base64');
    const headers = {
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(NOW),
      'webhook-signature': `v1,${forged}`,
    };

    for (const secret of ['whsec_', 'whsec_!!!!', 'whsec_not base64']) {
      const check = { scheme: 'standard-webhooks', secret } as const;
      expect(() => verifySignature(nodeCrypto, { headers, body: BODY }, check, NOW)).toThrow(
        'The key is not base64',
      );
    }
  });

  it('compares texts in constant time, whatever their lengths', () => {
    expect(nodeCrypto.equal('sha256=abc', 'sha256=abc')).toBe(true);
    expect(nodeCrypto.equal('sha256=abc', 'sha256=abd')).toBe(false);
    expect(nodeCrypto.equal('sha256=abc', 'sha256=abcd')).toBe(false);
  });
});
