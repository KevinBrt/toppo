import { prioritiesRequestSchema, prioritiesResponseSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { savePriorities } from './commands/save-priorities.command.ts';
import { listPriorities } from './queries/list-priorities.query.ts';

/**
 * The instance's four priority levels, renamed but never added, read and saved whole by the
 * settings (`instance.settings.manage`).
 */
export function registerPriorityRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/priorities',
    {
      config: { access: listPriorities.access },
      schema: { response: { 200: prioritiesResponseSchema } },
    },
    (request) => listPriorities.execute(request.executionContext, {}),
  );

  routes.put(
    '/api/v1/priorities',
    {
      config: { access: savePriorities.access },
      // Answers `204 No Content`: the client refetches what it shows.
      schema: { body: prioritiesRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply.status(204).send(await savePriorities.execute(request.executionContext, request.body)),
  );
}
