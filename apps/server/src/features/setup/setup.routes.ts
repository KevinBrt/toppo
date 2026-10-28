import {
  setupRequestSchema,
  setupResponseSchema,
  setupStatusResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { completeSetup } from './commands/complete-setup.command.ts';
import { getSetupStatus } from './queries/get-setup-status.query.ts';

/** First-run wizard: open only until the first administrator exists. */
export function registerSetupRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/setup',
    {
      config: { access: getSetupStatus.access },
      schema: { response: { 200: setupStatusResponseSchema } },
    },
    (request) => getSetupStatus.execute(request.executionContext, {}),
  );

  routes.post(
    '/api/v1/setup',
    {
      // Open to anyone until set up: guessing the setup code must stay slow.
      config: { access: completeSetup.access, rateLimit: { max: 10, windowSeconds: 600 } },
      schema: { body: setupRequestSchema, response: { 201: setupResponseSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await completeSetup.execute(request.executionContext, request.body)),
  );
}
