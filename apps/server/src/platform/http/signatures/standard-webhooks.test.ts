import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { newWebhookSecret, signWebhook, verifyWebhook } from './standard-webhooks.ts';

const NOW = 1_761_800_000;
const BODY = '{"type":"issue.created"}';

describe('a webhook’s signature', () => {
  it('is the specification’s: an HMAC SHA-256 of id.timestamp.body under the decoded key', () => {
    const secret = newWebhookSecret();
    const headers = signWebhook(secret, { id: 'msg_1', timestamp: NOW, body: BODY });
    const key = Buffer.from(secret.slice('whsec_'.length), 'base64');

    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/);
    expect(headers).toStrictEqual({
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(NOW),
      'webhook-signature': `v1,${createHmac('sha256', key).update(`msg_1.${NOW}.${BODY}`).digest('base64')}`,
    });
  });

  it('is checked against the body, the id, the time and the key', () => {
    const secret = newWebhookSecret();
    const headers = signWebhook(secret, { id: 'msg_1', timestamp: NOW, body: BODY });

    expect(verifyWebhook(secret, headers, BODY, NOW)).toBe(true);
    expect(verifyWebhook(secret, headers, `${BODY} `, NOW)).toBe(false);
    expect(verifyWebhook(secret, { ...headers, 'webhook-id': 'msg_2' }, BODY, NOW)).toBe(false);
    expect(verifyWebhook(newWebhookSecret(), headers, BODY, NOW)).toBe(false);
    expect(verifyWebhook(secret, { ...headers, 'webhook-signature': undefined }, BODY, NOW)).toBe(
      false,
    );
  });

  it('is refused five minutes away from its timestamp, against a replay', () => {
    const secret = newWebhookSecret();
    const headers = signWebhook(secret, { id: 'msg_1', timestamp: NOW, body: BODY });

    expect(verifyWebhook(secret, headers, BODY, NOW + 300)).toBe(true);
    expect(verifyWebhook(secret, headers, BODY, NOW + 301)).toBe(false);
    expect(verifyWebhook(secret, headers, BODY, NOW - 301)).toBe(false);
  });

  it('takes any of several signatures, as when a key is replaced', () => {
    const secret = newWebhookSecret();
    const signed = signWebhook(secret, { id: 'msg_1', timestamp: NOW, body: BODY });
    const other = signWebhook(newWebhookSecret(), { id: 'msg_1', timestamp: NOW, body: BODY });
    const both = `${other['webhook-signature']} ${signed['webhook-signature']}`;

    expect(verifyWebhook(secret, { ...signed, 'webhook-signature': both }, BODY, NOW)).toBe(true);
    expect(
      verifyWebhook(
        secret,
        { ...signed, 'webhook-signature': signed['webhook-signature'].replace('v1,', 'v2,') },
        BODY,
        NOW,
      ),
    ).toBe(false);
  });
});
