import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  OUTBOUND_LIMITS,
  type OutboundFailure,
  type OutboundPolicy,
  type OutboundRequest,
  outboundFetch,
  redirectTarget,
} from './outbound-fetch.ts';

/** Two servers on the loopback, so that a redirect may change origin. */
let here = '';
let elsewhere = '';
let closedPort = 0;
const servers: Server[] = [];

/** What a server answers, by path: what it received, redirects, too much, or nothing. */
function answer(request: IncomingMessage, response: ServerResponse, body: string): void {
  const url = new URL(request.url ?? '/', 'http://localhost');
  switch (url.pathname) {
    case '/echo':
      response.setHeader('set-cookie', 'session=stolen');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ method: request.method, headers: request.headers, body }));
      return;
    case '/redirect':
      response.writeHead(Number(url.searchParams.get('status') ?? 302), {
        location: url.searchParams.get('to') ?? '/echo',
      });
      response.end();
      return;
    case '/loop':
      response.writeHead(302, { location: '/loop' }).end();
      return;
    case '/large':
      response.end('x'.repeat(100));
      return;
    case '/streamed':
      response.write('x'.repeat(60));
      response.end('x'.repeat(60));
      return;
    default:
      // `/slow`: never answers.
      return;
  }
}

async function listen(): Promise<{ server: Server; origin: string }> {
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => answer(request, response, Buffer.concat(chunks).toString('utf8')));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return { server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

beforeAll(async () => {
  here = (await listen()).origin;
  elsewhere = (await listen()).origin;
  const closed = await listen();
  closedPort = (closed.server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => closed.server.close(() => resolve()));
});

afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

/** The loopback, allowed by name as an administrator would allow a team's own server. */
const LOOPBACK: OutboundPolicy = {
  caller: 'test',
  mayReach: () => true,
  mayReachInside: (url) => url.hostname === '127.0.0.1',
};
const PUBLIC_ONLY: OutboundPolicy = {
  caller: 'test',
  mayReach: () => true,
  mayReachInside: () => false,
};

function get(url: string, extra: Partial<OutboundRequest> = {}): OutboundRequest {
  return { url, method: 'GET', ...extra };
}

async function failureOf(
  promise: Promise<unknown>,
): Promise<OutboundFailure | 'ANSWERED' | 'OTHER'> {
  try {
    await promise;
    return 'ANSWERED';
  } catch (error) {
    return error instanceof Error && 'code' in error ? (error.code as OutboundFailure) : 'OTHER';
  }
}

describe('a request leaving Toppo', () => {
  it('sends what it was given, without cookies, and answers without them', async () => {
    const answered = await outboundFetch(
      {
        url: `${here}/echo?week=44`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session=mine',
          Host: 'evil.example',
          'X-Summary': 'weekly',
        },
        body: '{"text":"Été"}',
      },
      LOOPBACK,
    );

    const echoed = JSON.parse(answered.body) as { method: string; headers: Record<string, string> };
    expect(answered.status).toBe(200);
    expect(answered.headers['set-cookie']).toBeUndefined();
    expect(answered.headers['content-type']).toBe('application/json');
    expect(echoed).toMatchObject({
      method: 'POST',
      body: '{"text":"Été"}',
      headers: {
        'content-type': 'application/json',
        'x-summary': 'weekly',
        'user-agent': 'Toppo',
        host: here.slice('http://'.length),
      },
    });
    expect(echoed.headers['cookie']).toBeUndefined();
  });

  it.each([
    ['the loopback', 'http://127.0.0.1:9/'],
    ['the loopback by its name', 'http://localhost:9/'],
    ['a cloud’s metadata', 'http://169.254.169.254/latest/meta-data/'],
    ['a private network', 'http://10.0.0.1/'],
    ['the IPv6 loopback', 'http://[::1]:9/'],
    ['the loopback written as a number', 'http://2130706433:9/'],
    ['a file', 'file:///etc/passwd'],
    ['an address with credentials', 'http://ada:secret@example.com/'],
    ['what is no address', 'hooks.slack.com/services'],
  ])('never reaches %s', async (_, url) => {
    expect(await failureOf(outboundFetch(get(url), PUBLIC_ONLY))).toBe('ADDRESS_NOT_ALLOWED');
  });

  it('reaches a host inside the network only as named, not another one beside it', async () => {
    const named: OutboundPolicy = {
      caller: 'test',
      mayReach: () => true,
      mayReachInside: (url) => url.hostname === 'localhost',
    };

    expect(await failureOf(outboundFetch(get(`${here}/echo`), named))).toBe('ADDRESS_NOT_ALLOWED');
    expect((await outboundFetch(get(`${here}/echo`), LOOPBACK)).status).toBe(200);
  });

  it('sends in clear inside the network only, when its policy says so', async () => {
    const inClearInside: OutboundPolicy = {
      caller: 'test',
      mayReach: () => true,
      mayReachInside: () => true,
      clearInsideOnly: true,
    };

    expect((await outboundFetch(get(`${here}/echo`), inClearInside)).status).toBe(200);
    // A public address, in clear: refused before anything is sent.
    expect(await failureOf(outboundFetch(get('http://93.184.215.14/'), inClearInside))).toBe(
      'ADDRESS_NOT_ALLOWED',
    );
    expect(await failureOf(outboundFetch(get('http://localhost:9/'), inClearInside))).not.toBe(
      'ADDRESS_NOT_ALLOWED',
    );
  });

  it('goes only where its policy allows, at each redirect too', async () => {
    const hereOnly: OutboundPolicy = {
      caller: 'test',
      mayReach: (url) => url.origin === here,
      mayReachInside: (url) => url.hostname === '127.0.0.1',
    };
    const to = (target: string) => `${here}/redirect?to=${encodeURIComponent(target)}`;

    expect(await failureOf(outboundFetch(get(`${elsewhere}/echo`), hereOnly))).toBe(
      'HOST_NOT_DECLARED',
    );
    expect(await failureOf(outboundFetch(get(to(`${elsewhere}/echo`)), hereOnly))).toBe(
      'HOST_NOT_DECLARED',
    );
    expect(await failureOf(outboundFetch(get(to('http://10.0.0.1/')), LOOPBACK))).toBe(
      'ADDRESS_NOT_ALLOWED',
    );
    expect(await failureOf(outboundFetch(get(`${here}/loop`), LOOPBACK))).toBe(
      'TOO_MANY_REDIRECTS',
    );
  });

  it('follows redirects as a browser does: a GET after a form, no credentials elsewhere', async () => {
    const seeOther = await outboundFetch(
      {
        url: `${here}/redirect?status=303&to=/echo`,
        method: 'POST',
        headers: { authorization: 'Bearer secret', 'content-type': 'text/plain' },
        body: 'logged',
      },
      LOOPBACK,
    );
    const moved = await outboundFetch(
      get(`${here}/redirect?status=307&to=${encodeURIComponent(`${elsewhere}/echo`)}`, {
        headers: {
          authorization: 'Bearer secret',
          'x-api-key': 'secret',
          'private-token': 'secret',
          accept: 'application/json',
        },
      }),
      LOOPBACK,
    );

    expect(JSON.parse(seeOther.body)).toMatchObject({
      method: 'GET',
      body: '',
      headers: { authorization: 'Bearer secret' },
    });
    expect(JSON.parse(seeOther.body).headers['content-type']).toBeUndefined();
    const elsewhereGot = JSON.parse(moved.body).headers;
    expect(elsewhereGot.authorization).toBeUndefined();
    expect(elsewhereGot['x-api-key']).toBeUndefined();
    expect(elsewhereGot['private-token']).toBeUndefined();
    expect(elsewhereGot.accept).toBe('application/json');
  });

  it('never follows a redirect from https down to http, nor to no address', () => {
    const secure = new URL('https://hooks.example.com/send');
    const refusal = (location: string, from: URL) => {
      try {
        redirectTarget(location, from);
        return 'FOLLOWED';
      } catch (error) {
        return error instanceof Error && 'code' in error ? error.code : 'OTHER';
      }
    };

    expect(refusal('http://hooks.example.com/send', secure)).toBe('ADDRESS_NOT_ALLOWED');
    expect(refusal('https://cdn.example.com/send', secure)).toBe('FOLLOWED');
    expect(refusal('https://cdn.example.com/send', new URL('http://example.com'))).toBe('FOLLOWED');
    expect(refusal('http://[::1', secure)).toBe('NETWORK_ERROR');
  });

  it('stops at its deadline and at its size, whatever the server says', async () => {
    const small = { ...OUTBOUND_LIMITS, maxResponseBytes: 100 - 1 };
    const quick = { ...OUTBOUND_LIMITS, deadlineMs: 200 };

    expect(await failureOf(outboundFetch(get(`${here}/large`), LOOPBACK, small))).toBe(
      'RESPONSE_TOO_LARGE',
    );
    expect(await failureOf(outboundFetch(get(`${here}/streamed`), LOOPBACK, small))).toBe(
      'RESPONSE_TOO_LARGE',
    );
    expect(await failureOf(outboundFetch(get(`${here}/slow`), LOOPBACK, quick))).toBe('TIMEOUT');
  });

  it('tells a server that does not answer by its kind only', async () => {
    expect(await failureOf(outboundFetch(get(`http://127.0.0.1:${closedPort}/`), LOOPBACK))).toBe(
      'NETWORK_ERROR',
    );
  });
});
