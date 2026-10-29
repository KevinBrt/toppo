import { describe, expect, it } from 'vitest';
import type { SignatureCheck } from '../protocol/declarations/routes.ts';
import { type HostCrypto, signedHeaders, verifySignature } from './signatures.ts';

/**
 * A host whose digest writes what it was asked: the schemes are checked here, the digests
 * themselves where Node computes them (Toppo's and the testing kit's tests).
 */
const crypto: HostCrypto = {
  hmac: (algorithm, key, data, encoding) =>
    `${algorithm}:${typeof key === 'string' ? key : `b64(${key.base64})`}:${data}:${encoding}`,
  equal: (a, b) => a === b,
};

const NOW = 1_793_299_743;
const BODY = '{"ref":"refs/heads/main"}';
const MESSAGE = { id: 'msg_1', timestamp: NOW };

const verify = (headers: Record<string, string>, check: SignatureCheck, now = NOW, body = BODY) =>
  verifySignature(crypto, { headers, body }, check, now);

describe('a signed request', () => {
  it.each<SignatureCheck>([
    { scheme: 'github', secret: 's3cret' },
    { scheme: 'standard-webhooks', secret: 'whsec_c2VjcmV0' },
    { scheme: 'token', header: 'x-gitlab-token', secret: 's3cret' },
    {
      scheme: 'hmac',
      header: 'x-gitea-signature',
      algorithm: 'sha256',
      encoding: 'hex',
      secret: 's',
    },
    {
      scheme: 'hmac',
      header: 'x-signature',
      algorithm: 'sha512',
      encoding: 'base64',
      prefix: 'v1=',
      secret: 's',
    },
  ])('is checked as it was signed, $scheme', (check) => {
    const headers = signedHeaders(crypto, check, BODY, MESSAGE);

    expect(verify(headers, check)).toBe(true);
    expect(verify(headers, check, NOW, `${BODY} `)).toBe(check.scheme === 'token');
    expect(verify({}, check)).toBe(false);
    expect(verify(headers, { ...check, secret: 'other' })).toBe(false);
  });

  it('reads GitHub’s signature as GitHub writes it', () => {
    expect(signedHeaders(crypto, { scheme: 'github', secret: 's' }, BODY, MESSAGE)).toStrictEqual({
      'x-hub-signature-256': `sha256=sha256:s:${BODY}:hex`,
    });
    // Hex in capitals is the same digest; without its prefix, it is not GitHub's.
    const digest = `sha256:s:${BODY}:hex`;
    expect(
      verify(
        { 'x-hub-signature-256': `sha256=${digest.toUpperCase()}` },
        { scheme: 'github', secret: 's' },
      ),
    ).toBe(true);
    expect(verify({ 'x-hub-signature-256': digest }, { scheme: 'github', secret: 's' })).toBe(
      false,
    );
  });

  it('dates Standard Webhooks, signed with the key a whsec_ secret holds, any one of several', () => {
    const check: SignatureCheck = { scheme: 'standard-webhooks', secret: 'whsec_c2VjcmV0' };
    const headers = signedHeaders(crypto, check, BODY, MESSAGE);

    expect(headers).toStrictEqual({
      'webhook-id': 'msg_1',
      'webhook-timestamp': String(NOW),
      'webhook-signature': `v1,sha256:b64(c2VjcmV0):msg_1.${NOW}.${BODY}:base64`,
    });
    expect(verify(headers, check, NOW + 300)).toBe(true);
    expect(verify(headers, check, NOW + 301)).toBe(false);
    expect(verify(headers, check, NOW - 301)).toBe(false);
    expect(verify(headers, { ...check, toleranceSeconds: 3600 }, NOW + 3600)).toBe(true);
    // The key as typed, without its prefix, is the same.
    expect(verify(headers, { ...check, secret: 'c2VjcmV0' })).toBe(true);
    expect(verify({ ...headers, 'webhook-id': 'msg_2' }, check)).toBe(false);
    expect(verify({ ...headers, 'webhook-timestamp': 'yesterday' }, check)).toBe(false);
    expect(
      verify(
        { ...headers, 'webhook-signature': `v1,old v2,x ${headers['webhook-signature']}` },
        check,
      ),
    ).toBe(true);
    expect(
      verify(
        {
          ...headers,
          'webhook-signature': headers['webhook-signature']?.replace('v1,', 'v2,') ?? '',
        },
        check,
      ),
    ).toBe(false);
  });
});
