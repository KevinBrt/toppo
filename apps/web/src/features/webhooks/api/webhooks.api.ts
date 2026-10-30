import {
  type WebhookDetailsResponse,
  type WebhookRequest,
  type WebhookSecretResponse,
  type WebhookSummary,
  webhookDetailsResponseSchema,
  webhookSecretResponseSchema,
  webhooksResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

/** A test or a delivery sent again: queued, its outcome shown among the deliveries. */
const queued = z.object({ id: z.uuid() });

const WEBHOOKS_PATH = '/api/v1/webhooks';

const webhookPath = (id: string) => `${WEBHOOKS_PATH}/${encodeURIComponent(id)}`;

/** Server calls about the webhooks of the instance. Administrators only. */
export const Webhooks = {
  /** Every webhook: 20 at most, loaded whole. */
  async list(): Promise<WebhookSummary[]> {
    return (await apiRequest(WEBHOOKS_PATH, { schema: webhooksResponseSchema })).webhooks;
  },

  /** A webhook and its latest deliveries, never its secret. */
  async get(id: string): Promise<WebhookDetailsResponse> {
    return await apiRequest(webhookPath(id), { schema: webhookDetailsResponseSchema });
  },

  /** Adds a webhook, enabled; answers its id and its secret, shown this once. */
  async create(request: WebhookRequest): Promise<WebhookSecretResponse> {
    return await apiRequest(WEBHOOKS_PATH, {
      method: 'POST',
      body: request,
      schema: webhookSecretResponseSchema,
    });
  },

  async update(id: string, request: WebhookRequest): Promise<void> {
    await apiRequest(webhookPath(id), { method: 'PUT', body: request, schema: noContent });
  },

  async remove(id: string): Promise<void> {
    await apiRequest(webhookPath(id), { method: 'DELETE', schema: noContent });
  },

  /** Sends it events again, its failures forgotten. */
  async enable(id: string): Promise<void> {
    await apiRequest(`${webhookPath(id)}/enable`, { method: 'POST', schema: noContent });
  },

  async disable(id: string): Promise<void> {
    await apiRequest(`${webhookPath(id)}/disable`, { method: 'POST', schema: noContent });
  },

  /** Signs its requests with a new secret from now on; answers it, shown this once. */
  async renewSecret(id: string): Promise<string> {
    return (
      await apiRequest(`${webhookPath(id)}/secret`, {
        method: 'POST',
        schema: webhookSecretResponseSchema,
      })
    ).secret;
  },

  async sendTest(id: string): Promise<void> {
    await apiRequest(`${webhookPath(id)}/test`, { method: 'POST', schema: queued });
  },

  /** Sends a delivery again, as it was, under the same `webhook-id`. */
  async redeliver(id: string, deliveryId: string): Promise<void> {
    await apiRequest(`${webhookPath(id)}/deliveries/${encodeURIComponent(deliveryId)}/redeliver`, {
      method: 'POST',
      schema: queued,
    });
  },
};
