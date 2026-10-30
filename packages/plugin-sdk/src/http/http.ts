import {
  HTTP_FAILURES,
  type HttpAnswer,
  type HttpFailureCode,
  type HttpMethod,
  type HttpRequest,
} from '../protocol/declarations/http.ts';

/**
 * Why `ctx.http.fetch` got no answer: Toppo refused the request (a host not declared, an address
 * inside the network, too many calls), or it took too long, answered too much, or nobody did.
 * An answer of any status is no failure: read `status` instead.
 */
export class HttpFailure extends Error {
  readonly code: HttpFailureCode;

  constructor(code: HttpFailureCode) {
    super(code);
    this.name = 'HttpFailure';
    this.code = code;
  }
}

export interface HttpInit {
  method?: HttpMethod;
  headers?: Readonly<Record<string, string>>;
  /** Text, 64 KB at most: `JSON.stringify()` it for JSON. */
  body?: string;
}

/** What the server answered, read whole: within 256 KB, as text. */
export interface HttpResponse {
  readonly status: number;
  /** A status from 200 to 299. */
  readonly ok: boolean;
  /** Lowercase names. */
  readonly headers: Readonly<Record<string, string>>;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export interface HttpClient {
  /**
   * Sends a request where the plugin declared it may (`http` in `definePlugin`), as `fetch`
   * would, without cookies. Throws an `HttpFailure` when it gets no answer.
   */
  fetch(url: string, init?: HttpInit): Promise<HttpResponse>;
}

const isHttpFailure = (code: string): code is HttpFailureCode =>
  (HTTP_FAILURES as readonly string[]).includes(code);

/** `ctx.http`, asking Toppo to send each request. */
export function createHttpClient(send: (request: HttpRequest) => Promise<HttpAnswer>): HttpClient {
  return {
    async fetch(url, { method, headers, body } = {}) {
      let answer: HttpAnswer;
      try {
        answer = await send({ url, method, headers, body: body ?? null });
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        throw isHttpFailure(code) ? new HttpFailure(code) : error;
      }
      return {
        status: answer.status,
        ok: answer.status >= 200 && answer.status < 300,
        headers: answer.headers,
        text: () => Promise.resolve(answer.body),
        json: () => Promise.resolve(JSON.parse(answer.body) as unknown),
      };
    },
  };
}
