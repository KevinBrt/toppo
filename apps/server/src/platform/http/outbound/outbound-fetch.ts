import { lookup } from 'node:dns';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { isInternalAddress } from './internal-addresses.ts';

/**
 * Requests that leave Toppo: a plugin's `ctx.http.fetch`, and later the core's webhooks. Each
 * goes to a public address only, unless an administrator named its host, checked as the
 * connection is made (no DNS answer can change in between) and again at each redirect; within a
 * total deadline and a size, without cookies.
 */

export type OutboundMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Why a request got no answer. Mirrors HTTP_FAILURES (`@toppo-tracker/plugin-sdk/protocol`). */
export type OutboundFailure =
  | 'HOST_NOT_DECLARED'
  | 'ADDRESS_NOT_ALLOWED'
  | 'TIMEOUT'
  | 'RESPONSE_TOO_LARGE'
  | 'TOO_MANY_REDIRECTS'
  | 'NETWORK_ERROR';

export class OutboundError extends Error {
  readonly code: OutboundFailure;

  constructor(code: OutboundFailure, message: string) {
    super(message);
    this.name = 'OutboundError';
    this.code = code;
  }
}

export interface OutboundRequest {
  url: string;
  method: OutboundMethod;
  headers?: Readonly<Record<string, string>>;
  body?: string | null;
}

/** Where a caller may go, beyond what no request reaches. */
export interface OutboundPolicy {
  /** Whether it may reach this address at all: the hosts a plugin declared, for one. */
  mayReach(url: URL): boolean;
  /** Hosts it may reach although they lie inside the network, as an administrator named them. */
  privateHosts: readonly string[];
}

export interface OutboundLimits {
  /** For the whole request, redirects included. */
  deadlineMs: number;
  maxResponseBytes: number;
  maxRedirects: number;
}

export const OUTBOUND_LIMITS: OutboundLimits = {
  deadlineMs: 10_000,
  maxResponseBytes: 1024 * 1024,
  maxRedirects: 5,
};

export interface OutboundAnswer {
  status: number;
  /** Lowercase names; never `set-cookie`. */
  headers: Record<string, string>;
  /** Read as UTF-8 text. */
  body: string;
}

/** Headers Toppo sets itself, or that would carry what no caller should send. */
const KEPT_HEADERS = new Set([
  'accept-encoding',
  'connection',
  'content-length',
  'cookie',
  'expect',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

/** Sends a request where its policy allows, following its redirects as a browser would. */
export async function outboundFetch(
  request: OutboundRequest,
  policy: OutboundPolicy,
  limits: OutboundLimits = OUTBOUND_LIMITS,
): Promise<OutboundAnswer> {
  const signal = AbortSignal.timeout(limits.deadlineMs);
  let url = addressOf(request.url);
  let sent: Sent = {
    method: request.method,
    headers: headersSent(request.headers ?? {}),
    body: request.body ?? null,
  };
  for (let redirects = 0; ; redirects += 1) {
    if (!policy.mayReach(url)) {
      throw new OutboundError('HOST_NOT_DECLARED', `${url.host} is not declared`);
    }
    const reply = await exchange(url, sent, policy, limits, signal);
    if (reply.location === null) {
      return reply.answer;
    }
    if (redirects === limits.maxRedirects) {
      throw new OutboundError('TOO_MANY_REDIRECTS', `More than ${limits.maxRedirects} redirects`);
    }
    const next = addressOf(new URL(reply.location, url).href);
    sent = redirected(sent, reply.answer.status, next.origin === url.origin);
    url = next;
  }
}

interface Sent {
  method: OutboundMethod;
  headers: Record<string, string>;
  body: string | null;
}

/** What a redirect sends next: a `GET` after a form, never credentials to another origin. */
function redirected(sent: Sent, status: number, sameOrigin: boolean): Sent {
  const asGet = status === 303 || ((status === 301 || status === 302) && sent.method === 'POST');
  const dropped = new Set([
    ...(sameOrigin ? [] : ['authorization']),
    ...(asGet ? ['content-type'] : []),
  ]);
  const headers = Object.fromEntries(
    Object.entries(sent.headers).filter(([name]) => !dropped.has(name)),
  );
  return asGet
    ? { method: sent.method === 'HEAD' ? 'HEAD' : 'GET', headers, body: null }
    : { ...sent, headers };
}

/** An address requests may be sent to: http or https, without credentials in it. */
function addressOf(text: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new OutboundError('ADDRESS_NOT_ALLOWED', 'Not an address');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== '') {
    throw new OutboundError('ADDRESS_NOT_ALLOWED', 'Only http and https addresses, bare');
  }
  return url;
}

function headersSent(headers: Readonly<Record<string, string>>): Record<string, string> {
  const kept = Object.entries(headers)
    .map(([name, value]): [string, string] => [name.toLowerCase(), value])
    .filter(([name]) => !(KEPT_HEADERS.has(name) || name.startsWith('proxy-')));
  return { 'user-agent': 'Toppo', ...Object.fromEntries(kept) };
}

/**
 * Resolves a host as the connection asks, and refuses it if any of its addresses lies inside the
 * network, unless an administrator named it: the connection goes to what was checked.
 */
function guardedLookup(allowInternal: boolean): LookupFunction {
  return (hostname, options, callback) => {
    lookup(
      hostname,
      { family: options.family, hints: options.hints, all: true },
      (error, found) => {
        if (error) {
          callback(error, '', 0);
          return;
        }
        const [first] = found;
        if (!first || (!allowInternal && found.some(({ address }) => isInternalAddress(address)))) {
          callback(
            new OutboundError('ADDRESS_NOT_ALLOWED', `${hostname} lies inside the network`),
            '',
            0,
          );
          return;
        }
        if (options.all) {
          callback(null, found);
        } else {
          callback(null, first.address, first.family);
        }
      },
    );
  };
}

interface Reply {
  /** Where a redirect leads; `null` for an answer. */
  location: string | null;
  answer: OutboundAnswer;
}

/** One request and its answer, on a connection of its own. */
function exchange(
  url: URL,
  sent: Sent,
  policy: OutboundPolicy,
  limits: OutboundLimits,
  signal: AbortSignal,
): Promise<Reply> {
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1');
  const allowInternal = policy.privateHosts.includes(hostname);
  return new Promise<Reply>((resolve, reject) => {
    const fail = (error: unknown) => reject(failureOf(error, signal));
    // An address written as such is never resolved: checked here instead.
    if (isIP(hostname) !== 0 && !allowInternal && isInternalAddress(hostname)) {
      fail(new OutboundError('ADDRESS_NOT_ALLOWED', `${hostname} lies inside the network`));
      return;
    }
    const body = sent.body === null ? null : Buffer.from(sent.body, 'utf8');
    try {
      const outgoing = (url.protocol === 'https:' ? httpsRequest : httpRequest)(
        {
          protocol: url.protocol,
          hostname,
          port: url.port === '' ? undefined : Number(url.port),
          path: `${url.pathname}${url.search}`,
          method: sent.method,
          headers: {
            ...sent.headers,
            'accept-encoding': 'identity',
            ...(body ? { 'content-length': String(body.length) } : {}),
          },
          lookup: guardedLookup(allowInternal),
          // A connection of its own: one kept alive would skip the check of the next request.
          agent: false,
          signal,
        },
        (response) => read(response, limits, signal).then(resolve, fail),
      );
      outgoing.on('error', fail);
      outgoing.end(body ?? undefined);
    } catch (error) {
      fail(error);
    }
  });
}

/** An answer, read whole within its size; a redirect, left unread. */
function read(
  response: IncomingMessage,
  limits: OutboundLimits,
  signal: AbortSignal,
): Promise<Reply> {
  const status = response.statusCode ?? 0;
  const headers = headersOf(response);
  const location = REDIRECTS.has(status) ? (headers['location'] ?? null) : null;
  if (location !== null) {
    response.resume();
    return Promise.resolve({ location, answer: { status, headers, body: '' } });
  }
  return new Promise<Reply>((resolve, reject) => {
    const tooLarge = () =>
      new OutboundError('RESPONSE_TOO_LARGE', `More than ${limits.maxResponseBytes} bytes`);
    if (Number(headers['content-length']) > limits.maxResponseBytes) {
      response.destroy();
      reject(tooLarge());
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    response.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limits.maxResponseBytes) {
        response.destroy();
        reject(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () =>
      resolve({
        location: null,
        answer: { status, headers, body: Buffer.concat(chunks).toString('utf8') },
      }),
    );
    response.on('error', (error) => reject(failureOf(error, signal)));
  });
}

function headersOf(response: IncomingMessage): Record<string, string> {
  return Object.fromEntries(
    Object.entries(response.headers).flatMap(([name, value]) =>
      name === 'set-cookie' || value === undefined
        ? []
        : [[name, Array.isArray(value) ? value.join(', ') : value]],
    ),
  );
}

/** What a failure tells the caller: Toppo's refusal as it is, anything else by its kind only. */
function failureOf(error: unknown, signal: AbortSignal): OutboundError {
  if (error instanceof OutboundError) {
    return error;
  }
  return signal.aborted
    ? new OutboundError('TIMEOUT', 'No answer in time')
    : new OutboundError('NETWORK_ERROR', 'The request could not be sent');
}
