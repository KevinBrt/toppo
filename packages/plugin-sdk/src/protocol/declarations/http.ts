import { z } from 'zod';
import { SETTING_NAME, type SettingsSchema } from './settings.ts';

/** What `ctx.http.fetch` sends. */
export const HTTP_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

/**
 * Why `ctx.http.fetch` got no answer: refused by Toppo (a host the plugin did not declare, an
 * address inside the network, too many calls), or too slow, too large, sent round in circles,
 * or unreachable. An answer, whatever its status, is no failure.
 */
export const HTTP_FAILURES = [
  'HOST_NOT_DECLARED',
  'ADDRESS_NOT_ALLOWED',
  'TOO_MANY_CALLS',
  'TIMEOUT',
  'RESPONSE_TOO_LARGE',
  'TOO_MANY_REDIRECTS',
  'NETWORK_ERROR',
] as const;

export type HttpFailureCode = (typeof HTTP_FAILURES)[number];

export const HTTP_LIMITS = {
  callsPerMinute: 60,
  /** Each way, as UTF-8: what reaches the sandbox travels in one message of a million characters. */
  requestBytes: 64 * 1024,
  responseBytes: 256 * 1024,
  /** For the whole call, redirects included. */
  deadlineMs: 10_000,
  headers: 30,
  urlLength: 2000,
} as const;

/** `hooks.slack.com`: a host by its name, as the Internet knows it. */
export const HTTP_HOST =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * What a plugin may reach, shown to the administrator who approves it: hosts it names (a known
 * service), the address typed in some of its settings (a team's own chat), or any public site
 * (addresses that are data). Never an address inside the network, unless the approval names it.
 */
export const httpDeclarationSchema = z.union([
  z.array(z.string().regex(HTTP_HOST, 'A host is named like hooks.slack.com')).min(1).max(20),
  z.strictObject({
    fromSettings: z.array(z.string().regex(SETTING_NAME)).min(1).max(5),
  }),
  z.literal('any'),
]);

export type HttpDeclaration = z.infer<typeof httpDeclarationSchema>;

/** Refuses an address read from a setting the instance does not have, or that holds no text. */
export function checkHttp(
  manifest: { http: HttpDeclaration | null; settings: SettingsSchema },
  ctx: z.RefinementCtx,
): void {
  const { http } = manifest;
  if (http === null || http === 'any' || Array.isArray(http)) {
    return;
  }
  http.fromSettings.forEach((name, index) => {
    const setting = manifest.settings.properties[name];
    if (setting?.type !== 'string' || 'enum' in setting) {
      ctx.addIssue({
        code: 'custom',
        path: ['http', 'fromSettings', index],
        message: `${name} is no text setting of the plugin: it cannot hold an address`,
      });
    }
  });
}

/** A header's name, as HTTP writes one. */
const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,100}$/;

/** Its length in UTF-8, counted by hand: Toppo's sandbox has no `TextEncoder`. */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    bytes += utf8Width(character.codePointAt(0) ?? 0);
  }
  return bytes;
}

function utf8Width(code: number): number {
  if (code < 0x80) {
    return 1;
  }
  if (code < 0x800) {
    return 2;
  }
  return code < 0x10000 ? 3 : 4;
}

/** What `ctx.http.fetch` asks Toppo to send. */
export const httpRequestSchema = z.object({
  url: z.string().max(HTTP_LIMITS.urlLength),
  method: z.enum(HTTP_METHODS).default('GET'),
  headers: z
    .record(
      z.string().regex(HEADER_NAME),
      z
        .string()
        .max(8192)
        .regex(/^[^\r\n]*$/),
    )
    .refine((headers) => Object.keys(headers).length <= HTTP_LIMITS.headers, {
      message: `At most ${HTTP_LIMITS.headers} headers`,
    })
    .default({}),
  body: z
    .string()
    .refine((body) => utf8Bytes(body) <= HTTP_LIMITS.requestBytes, {
      message: `At most ${HTTP_LIMITS.requestBytes} bytes`,
    })
    .nullable()
    .default(null),
});

export type HttpRequest = z.input<typeof httpRequestSchema>;

/** What the server answered, whatever its status. */
export const httpAnswerSchema = z.object({
  status: z.int().min(100).max(599),
  /** Lowercase names. */
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

export type HttpAnswer = z.infer<typeof httpAnswerSchema>;
