import {
  webhookDeliveryParamsSchema,
  webhookDetailsResponseSchema,
  webhookIdParamsSchema,
  webhookSecretResponseSchema,
  webhooksResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { createWebhook } from './commands/create-webhook.command.ts';
import { deleteWebhook } from './commands/delete-webhook.command.ts';
import { disableWebhook } from './commands/disable-webhook.command.ts';
import { enableWebhook } from './commands/enable-webhook.command.ts';
import { redeliverWebhook } from './commands/redeliver-webhook.command.ts';
import { renewWebhookSecret } from './commands/renew-webhook-secret.command.ts';
import { sendTestWebhook } from './commands/send-test-webhook.command.ts';
import { updateWebhook } from './commands/update-webhook.command.ts';
import { webhookInputSchema } from './models/webhook-input.model.ts';
import { getWebhook } from './queries/get-webhook.query.ts';
import { listWebhooks } from './queries/list-webhooks.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** A test or a delivery sent again: a request leaves Toppo for each, so a few a minute. */
const SEND_RATE_LIMIT = { max: 30, windowSeconds: 60 };

const queued = z.object({ id: z.uuid() });

/**
 * The webhooks of the instance: added, changed, enabled, disabled, removed, tested, and their
 * deliveries read and sent again. Administrators only.
 */
export function registerWebhookRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/webhooks',
    {
      config: { access: listWebhooks.access },
      schema: { response: { 200: webhooksResponseSchema } },
    },
    (request) => listWebhooks.execute(request.executionContext, {}),
  );

  routes.post(
    '/api/v1/webhooks',
    {
      config: { access: createWebhook.access },
      schema: { body: webhookInputSchema, response: { 201: webhookSecretResponseSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await createWebhook.execute(request.executionContext, request.body)),
  );

  routes.get(
    '/api/v1/webhooks/:webhookId',
    {
      config: { access: getWebhook.access },
      schema: { params: webhookIdParamsSchema, response: { 200: webhookDetailsResponseSchema } },
    },
    (request) => getWebhook.execute(request.executionContext, request.params),
  );

  routes.put(
    '/api/v1/webhooks/:webhookId',
    {
      config: { access: updateWebhook.access },
      schema: { params: webhookIdParamsSchema, body: webhookInputSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateWebhook.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/webhooks/:webhookId',
    {
      config: { access: deleteWebhook.access },
      schema: { params: webhookIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteWebhook.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/webhooks/:webhookId/enable',
    {
      config: { access: enableWebhook.access },
      schema: { params: webhookIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await enableWebhook.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/webhooks/:webhookId/disable',
    {
      config: { access: disableWebhook.access },
      schema: { params: webhookIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await disableWebhook.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/webhooks/:webhookId/secret',
    {
      config: { access: renewWebhookSecret.access },
      schema: { params: webhookIdParamsSchema, response: { 200: webhookSecretResponseSchema } },
    },
    (request) => renewWebhookSecret.execute(request.executionContext, request.params),
  );

  routes.post(
    '/api/v1/webhooks/:webhookId/test',
    {
      config: { access: sendTestWebhook.access, rateLimit: SEND_RATE_LIMIT },
      schema: { params: webhookIdParamsSchema, response: { 202: queued } },
    },
    async (request, reply) =>
      reply
        .status(202)
        .send(await sendTestWebhook.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/webhooks/:webhookId/deliveries/:deliveryId/redeliver',
    {
      config: { access: redeliverWebhook.access, rateLimit: SEND_RATE_LIMIT },
      schema: { params: webhookDeliveryParamsSchema, response: { 202: queued } },
    },
    async (request, reply) =>
      reply
        .status(202)
        .send(await redeliverWebhook.execute(request.executionContext, request.params)),
  );
}
