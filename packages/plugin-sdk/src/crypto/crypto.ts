import type {
  HmacAlgorithm,
  HmacEncoding,
  HmacKey,
  SignatureCheck,
} from '../protocol/declarations/routes.ts';
import type { RouteRequest } from '../routes/route.ts';

/**
 * `ctx.crypto`: what checks that a request comes from the service it says, computed by Toppo,
 * since the sandbox has no cryptography of its own.
 */
export interface CryptoClient {
  /**
   * Whether a request one of its routes received is signed as `check` says: GitHub's
   * `x-hub-signature-256`, Standard Webhooks, a token in a header, or any HMAC of the body.
   */
  verify(request: RouteRequest, check: SignatureCheck): Promise<boolean>;
  /** An HMAC of `data` under `key`, in hex unless said: for a service signing its own way. */
  hmac(
    algorithm: HmacAlgorithm,
    key: HmacKey,
    data: string,
    encoding?: HmacEncoding,
  ): Promise<string>;
  /** Whether two texts are the same, compared in a time that does not tell where they differ. */
  equal(a: string, b: string): Promise<boolean>;
}

type CryptoCalls = {
  'crypto.verify': (args: {
    request: Omit<RouteRequest, 'json'>;
    check: SignatureCheck;
  }) => Promise<boolean>;
  'crypto.hmac': (args: {
    algorithm: HmacAlgorithm;
    key: HmacKey;
    data: string;
    encoding: HmacEncoding;
  }) => Promise<string>;
  'crypto.equal': (args: { a: string; b: string }) => Promise<boolean>;
};

/** `ctx.crypto`, asking Toppo for each computation. */
export function createCryptoClient(calls: CryptoCalls): CryptoClient {
  return {
    verify: ({ method, headers, query, body }, check) =>
      calls['crypto.verify']({ request: { method, headers, query, body }, check }),
    hmac: (algorithm, key, data, encoding = 'hex') =>
      calls['crypto.hmac']({ algorithm, key, data, encoding }),
    equal: (a, b) => calls['crypto.equal']({ a, b }),
  };
}
