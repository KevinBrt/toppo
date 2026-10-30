import { signedHeaders, verifySignature } from '@toppo-tracker/plugin-sdk/host';
import { describe, expect, it } from 'vitest';
import { nodeCrypto, signed } from './test-signatures.ts';

describe('the signatures Toppo checks, with Node’s digests', () => {
  it('reads GitHub’s, as its documentation signs its example', () => {
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
        0,
      ),
    ).toBe(true);
    expect(verifySignature(nodeCrypto, request, { scheme: 'github', secret: 'other' }, 0)).toBe(
      false,
    );
  });

  it('reads Standard Webhooks’, as the specification signs its example', () => {
    // github.com/standard-webhooks/standard-webhooks, the specification's example.
    const check = {
      scheme: 'standard-webhooks',
      secret: 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    } as const;
    const message = { id: 'msg_p5jXN8AQM9LWM0D4loKWxJek', timestamp: 1614265330 };
    const body = '{"test": 2432232314}';

    expect(signedHeaders(nodeCrypto, check, body, message)['webhook-signature']).toBe(
      'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=',
    );
    expect(
      verifySignature(
        nodeCrypto,
        { headers: signedHeaders(nodeCrypto, check, body, message), body },
        check,
        message.timestamp,
      ),
    ).toBe(true);
  });

  it('compares texts of any length, and hex in either case', () => {
    expect(nodeCrypto.equal('abc', 'abc')).toBe(true);
    expect(nodeCrypto.equal('abc', 'abd')).toBe(false);
    expect(nodeCrypto.equal('abc', 'abcd')).toBe(false);
    expect(nodeCrypto.hmac('sha1', { base64: 'a2V5' }, 'data', 'hex')).toBe(
      nodeCrypto.hmac('sha1', 'key', 'data', 'hex'),
    );
  });

  it('refuses a key that is not base64, as Toppo does', () => {
    for (const base64 of ['', '!!!!', 'not base64']) {
      expect(() => nodeCrypto.hmac('sha256', { base64 }, 'data', 'hex')).toThrow(
        'The key is not base64',
      );
    }
  });

  it('signs a test’s request as the service would, now, its body as JSON when an object', () => {
    const request = signed(
      { scheme: 'standard-webhooks', secret: 'whsec_c2VjcmV0' },
      { ref: 'main' },
    );

    expect(request.body).toBe('{"ref":"main"}');
    expect(
      verifySignature(
        nodeCrypto,
        { headers: request.headers ?? {}, body: request.body ?? '' },
        { scheme: 'standard-webhooks', secret: 'whsec_c2VjcmV0' },
        Math.floor(Date.now() / 1000),
      ),
    ).toBe(true);
    expect(
      signed({ scheme: 'token', header: 'x-gitlab-token', secret: 't0ken' }, 'ping'),
    ).toStrictEqual({
      headers: { 'x-gitlab-token': 't0ken' },
      body: 'ping',
    });
  });
});
