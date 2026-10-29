import type {
  HmacAlgorithm,
  HmacEncoding,
  HmacKey,
  SignatureCheck,
} from '../protocol/declarations/routes.ts';

/**
 * Signed requests, as the services that send them write them: checked here once, for every host
 * of plugins (Toppo, the testing kit), and signed here for what Toppo sends itself. The digests
 * are the host's, which lends the sandbox the cryptography it lacks.
 */

/** What a host computes for a plugin: Node's, in Toppo and in the testing kit. */
export interface HostCrypto {
  hmac(algorithm: HmacAlgorithm, key: HmacKey, data: string, encoding: HmacEncoding): string;
  /** Whether two texts are the same, in a time that does not tell where they differ. */
  equal(a: string, b: string): boolean;
}

/** What a signature is checked against: a request's headers, in lowercase, and its body. */
export interface SignedRequest {
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: string;
}

/** Standard Webhooks' secrets: `whsec_`, then the key's bytes in base64. */
const STANDARD_SECRET_PREFIX = 'whsec_';

/** How old a Standard Webhooks request may be, or how far ahead: a request replayed later fails. */
const STANDARD_TOLERANCE_SECONDS = 5 * 60;

const GITHUB = { header: 'x-hub-signature-256', algorithm: 'sha256', prefix: 'sha256=' } as const;

function standardKey(secret: string): HmacKey {
  return {
    base64: secret.startsWith(STANDARD_SECRET_PREFIX)
      ? secret.slice(STANDARD_SECRET_PREFIX.length)
      : secret,
  };
}

/** `id.timestamp.body`: what Standard Webhooks signs. */
function standardContent(id: string, timestamp: string | number, body: string): string {
  return `${id}.${timestamp}.${body}`;
}

/** Whether `given`, a prefix then a digest, is the digest expected; hex compared in lowercase. */
function digestMatches(
  crypto: HostCrypto,
  given: string | undefined,
  { prefix, digest, encoding }: { prefix: string; digest: string; encoding: HmacEncoding },
): boolean {
  if (given === undefined || !given.startsWith(prefix)) {
    return false;
  }
  const sent = given.slice(prefix.length);
  return crypto.equal(encoding === 'hex' ? sent.toLowerCase() : sent, digest);
}

/**
 * Whether a request is signed as `check` says, at `now` (seconds since 1970) for a scheme that
 * dates its requests. Any doubt answers `false`: a header missing, a timestamp unreadable.
 */
export function verifySignature(
  crypto: HostCrypto,
  request: SignedRequest,
  check: SignatureCheck,
  now: number,
): boolean {
  const { headers, body } = request;
  switch (check.scheme) {
    case 'github':
      return digestMatches(crypto, headers[GITHUB.header], {
        prefix: GITHUB.prefix,
        digest: crypto.hmac(GITHUB.algorithm, check.secret, body, 'hex'),
        encoding: 'hex',
      });
    case 'hmac':
      return digestMatches(crypto, headers[check.header], {
        prefix: check.prefix ?? '',
        digest: crypto.hmac(check.algorithm, check.secret, body, check.encoding),
        encoding: check.encoding,
      });
    case 'token': {
      const given = headers[check.header];
      return given !== undefined && crypto.equal(given, check.secret);
    }
    case 'standard-webhooks': {
      const id = headers['webhook-id'];
      const timestamp = headers['webhook-timestamp'];
      const signatures = headers['webhook-signature'];
      if (!(id && signatures && timestamp && /^\d{1,12}$/.test(timestamp))) {
        return false;
      }
      if (
        Math.abs(now - Number(timestamp)) > (check.toleranceSeconds ?? STANDARD_TOLERANCE_SECONDS)
      ) {
        return false;
      }
      const expected = crypto.hmac(
        'sha256',
        standardKey(check.secret),
        standardContent(id, timestamp, body),
        'base64',
      );
      // Several while a key is being changed, separated by spaces: any one of them will do.
      return signatures.split(' ').some((signed) => {
        const [version, value] = signed.split(',');
        return version === 'v1' && value !== undefined && crypto.equal(value, expected);
      });
    }
  }
}

/**
 * The headers that sign `body` as `check` says: Toppo's own webhooks, and the testing kit's
 * requests. `message` dates and names it, for Standard Webhooks.
 */
export function signedHeaders(
  crypto: HostCrypto,
  check: SignatureCheck,
  body: string,
  message: { id: string; timestamp: number },
): Record<string, string> {
  switch (check.scheme) {
    case 'github':
      return {
        [GITHUB.header]: `${GITHUB.prefix}${crypto.hmac(GITHUB.algorithm, check.secret, body, 'hex')}`,
      };
    case 'hmac':
      return {
        [check.header]: `${check.prefix ?? ''}${crypto.hmac(check.algorithm, check.secret, body, check.encoding)}`,
      };
    case 'token':
      return { [check.header]: check.secret };
    case 'standard-webhooks': {
      const signature = crypto.hmac(
        'sha256',
        standardKey(check.secret),
        standardContent(message.id, message.timestamp, body),
        'base64',
      );
      return {
        'webhook-id': message.id,
        'webhook-timestamp': String(message.timestamp),
        'webhook-signature': `v1,${signature}`,
      };
    }
  }
}
