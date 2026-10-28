import { labelsRequestSchema, labelsResponseSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { saveLabels } from './commands/save-labels.command.ts';
import { listLabels } from './queries/list-labels.query.ts';

/**
 * The instance's labels, one list for every project, read and saved whole by the settings
 * (`instance.settings.manage`). Issues get theirs at `PUT /api/v1/issues/:issueKey/labels`.
 */
export function registerLabelRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/labels',
    {
      config: { access: listLabels.access },
      schema: { response: { 200: labelsResponseSchema } },
    },
    (request) => listLabels.execute(request.executionContext, {}),
  );

  routes.put(
    '/api/v1/labels',
    {
      config: { access: saveLabels.access },
      // Answers `204 No Content`: the client refetches what it shows.
      schema: { body: labelsRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply.status(204).send(await saveLabels.execute(request.executionContext, request.body)),
  );
}
