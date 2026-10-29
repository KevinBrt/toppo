import { z } from 'zod';

/** `push.receive`: a resource, a dot, what the route does with it, like an action's name. */
export const ROUTE_NAME = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

/** At most this many routes in a plugin. */
export const ROUTES_MAX = 20;

/**
 * What a route takes and answers, and how often: anyone on the internet may call it, so Toppo
 * bounds all of it before the plugin runs.
 */
export const ROUTE_LIMITS = {
  /** A body read whole: a webhook's payload, as text. */
  bodyBytes: 256 * 1024,
  /** What the plugin answers, as JSON. */
  answerBytes: 64 * 1024,
  /** As long as GitHub waits for an answer. */
  deadlineMs: 10_000,
  /** Requests a minute to one plugin's routes, whoever sends them. */
  perPluginPerMinute: 600,
  /** Headers and query parameters handed to the plugin, and the length of each. */
  fields: 100,
  fieldLength: 8 * 1024,
} as const;

/**
 * Where a service outside Toppo calls the plugin (`POST /api/v1/plugins/:pluginSlug/routes/:name`),
 * shown to who approves it. Public: the plugin checks the request is the service's.
 */
export const routeSchema = z.strictObject({
  name: z.string().max(60).regex(ROUTE_NAME, 'A route is named like push.receive'),
});

export type RouteDeclaration = z.infer<typeof routeSchema>;

export const routesSchema = z
  .array(routeSchema)
  .max(ROUTES_MAX)
  .refine((routes) => new Set(routes.map(({ name }) => name)).size === routes.length, {
    message: 'Two routes share a name',
  });

const fieldsSchema = z
  .record(z.string().max(200), z.string().max(ROUTE_LIMITS.fieldLength))
  .refine((fields) => Object.keys(fields).length <= ROUTE_LIMITS.fields, {
    message: `At most ${ROUTE_LIMITS.fields} fields`,
  });

/** A request as the plugin's route is given it: its body as it came, to check its signature. */
export const routeRequestSchema = z.strictObject({
  method: z.literal('POST'),
  /** Lowercase names, values as sent (several joined by `, `); never a cookie. */
  headers: fieldsSchema,
  query: fieldsSchema,
  /** As it came, unparsed: a signature is of these very characters. */
  body: z.string().max(ROUTE_LIMITS.bodyBytes),
});

export type RouteRequestData = z.infer<typeof routeRequestSchema>;

/** The statuses a route may answer: done, or refused as HTTP says. */
export const ROUTE_STATUSES = [200, 201, 202, 204, 400, 401, 403, 404, 409, 422] as const;

export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/** What a route answers: a status, and JSON for the caller (none with 204). */
export const routeAnswerSchema = z.strictObject({
  status: z.union(ROUTE_STATUSES.map((status) => z.literal(status))),
  body: z.json().optional(),
});

export type RouteAnswer = z.infer<typeof routeAnswerSchema>;

/** The digests a signature is made with. */
export const HMAC_ALGORITHMS = ['sha1', 'sha256', 'sha512'] as const;

export type HmacAlgorithm = (typeof HMAC_ALGORITHMS)[number];

/** How a digest is written: GitHub's `sha256=` writes hex, Standard Webhooks base64. */
export const HMAC_ENCODINGS = ['hex', 'base64'] as const;

export type HmacEncoding = (typeof HMAC_ENCODINGS)[number];

/** A key as typed (a webhook's secret), or its bytes in base64 (Standard Webhooks' `whsec_`). */
export const hmacKeySchema = z.union([
  z.string().min(1).max(1024),
  z.strictObject({ base64: z.string().min(1).max(1400) }),
]);

export type HmacKey = z.infer<typeof hmacKeySchema>;

const secretSchema = z.string().min(1).max(1024);

/** `x-hub-signature-256`: a header's name, as headers reach a route, in lowercase. */
const headerSchema = z
  .string()
  .max(100)
  .regex(/^[a-z0-9-]+$/, 'A header in lowercase');

/**
 * How a service signs what it sends, as `ctx.crypto.verify` checks it:
 * - `github`: `x-hub-signature-256: sha256=` and the hex HMAC SHA-256 of the body (GitHub,
 *   Bitbucket Cloud);
 * - `standard-webhooks`: `webhook-id`, `webhook-timestamp` and `webhook-signature`, under a
 *   `whsec_` secret, within minutes of now so that a request caught on its way is not replayed;
 * - `token`: a header that holds the secret itself (GitLab's `x-gitlab-token`);
 * - `hmac`: any HMAC of the body in a header (Gitea's `x-gitea-signature`, in hex).
 */
export const signatureCheckSchema = z.discriminatedUnion('scheme', [
  z.strictObject({ scheme: z.literal('github'), secret: secretSchema }),
  z.strictObject({
    scheme: z.literal('standard-webhooks'),
    secret: secretSchema,
    /** How old the request may be, or how far ahead, in seconds: five minutes by default. */
    toleranceSeconds: z.int().min(1).max(3600).optional(),
  }),
  z.strictObject({ scheme: z.literal('token'), header: headerSchema, secret: secretSchema }),
  z.strictObject({
    scheme: z.literal('hmac'),
    header: headerSchema,
    algorithm: z.enum(HMAC_ALGORITHMS),
    encoding: z.enum(HMAC_ENCODINGS),
    /** What the header writes before the digest: `sha256=`. */
    prefix: z.string().max(50).optional(),
    secret: secretSchema,
  }),
]);

export type SignatureCheck = z.infer<typeof signatureCheckSchema>;

export type SignatureScheme = SignatureCheck['scheme'];
