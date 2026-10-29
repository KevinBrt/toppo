import { z } from 'zod';
import { projectKeySchema } from '../project-key.ts';

/** Webhooks an instance keeps: each one's deliveries cost a request per change. */
export const WEBHOOKS_MAX = 20;

/** The projects a webhook may be told of by name; more is every project. */
export const WEBHOOK_PROJECTS_MAX = 100;

/** Deliveries kept per webhook, to be read and sent again: its latest. */
export const WEBHOOK_DELIVERIES_KEPT = 50;

/** Its deliveries given up in a row, after which Toppo stops it and tells the administrators. */
export const WEBHOOK_FAILURES_BEFORE_DISABLING = 10;

export const webhookIdParamsSchema = z.object({ webhookId: z.uuid() });

export const webhookDeliveryParamsSchema = webhookIdParamsSchema.extend({ deliveryId: z.uuid() });

/**
 * Body of `POST /api/v1/webhooks` and `PUT /api/v1/webhooks/:webhookId`: where to, what of, in
 * which projects. The events are the plugins' (`plugin-sdk/protocol`), checked by the server.
 */
export const webhookRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  // Kept as browsers write it (`HTTPS://Example.com` is `https://example.com/`), never with
  // credentials, which would travel with every request and show on its page.
  url: z
    .url({ protocol: /^https?$/ })
    .transform((url) => new URL(url))
    .refine(({ username, password }) => username === '' && password === '', {
      message: 'An address without credentials',
    })
    .transform(({ href }) => href)
    .pipe(z.string().max(2000)),
  events: z.array(z.string().max(60)).min(1).max(16),
  /** Every project, present and future, or these ones. */
  projects: z.union([z.literal('all'), z.array(projectKeySchema).max(WEBHOOK_PROJECTS_MAX)]),
  /** Its address may lie inside the network: a team's own server. */
  allowPrivate: z.boolean().default(false),
});

export type WebhookRequest = z.input<typeof webhookRequestSchema>;

/** Body of `POST /api/v1/webhooks` and of a new key: the key, shown this once. */
export const webhookSecretResponseSchema = z.object({
  id: z.uuid(),
  secret: z.string(),
});

export type WebhookSecretResponse = z.infer<typeof webhookSecretResponseSchema>;

export const webhookSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  url: z.string(),
  events: z.array(z.string()),
  allProjects: z.boolean(),
  projects: z.array(z.object({ id: z.uuid(), key: z.string(), name: z.string() })),
  allowPrivate: z.boolean(),
  enabled: z.boolean(),
  /** Its deliveries given up in a row, and why the last one was. */
  failures: z.number().int(),
  lastError: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type WebhookSummary = z.infer<typeof webhookSummarySchema>;

/** Body of `GET /api/v1/webhooks`. */
export const webhooksResponseSchema = z.object({ webhooks: z.array(webhookSummarySchema) });

export type WebhooksResponse = z.infer<typeof webhooksResponseSchema>;

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed'] as const;

export const webhookDeliverySchema = z.object({
  id: z.uuid(),
  messageId: z.uuid(),
  eventType: z.string(),
  status: z.enum(WEBHOOK_DELIVERY_STATUSES),
  attempts: z.number().int(),
  /** What the receiver answered, if it did. */
  responseStatus: z.number().int().nullable(),
  /** Why it got no answer. */
  error: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: z.iso.datetime(),
});

export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

/** Body of `GET /api/v1/webhooks/:webhookId`: the webhook and its latest deliveries. */
export const webhookDetailsResponseSchema = webhookSummarySchema.extend({
  deliveries: z.array(webhookDeliverySchema).max(WEBHOOK_DELIVERIES_KEPT),
});

export type WebhookDetailsResponse = z.infer<typeof webhookDetailsResponseSchema>;
