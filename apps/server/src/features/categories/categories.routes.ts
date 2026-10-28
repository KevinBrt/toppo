import { categoriesRequestSchema, categoriesResponseSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { saveCategories } from './commands/save-categories.command.ts';
import { listCategories } from './queries/list-categories.query.ts';

/**
 * The instance's categories of issues, one list for every project, read and saved whole by the
 * settings (`instance.settings.manage`).
 */
export function registerCategoryRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/categories',
    {
      config: { access: listCategories.access },
      schema: { response: { 200: categoriesResponseSchema } },
    },
    (request) => listCategories.execute(request.executionContext, {}),
  );

  routes.put(
    '/api/v1/categories',
    {
      config: { access: saveCategories.access },
      // Answers `204 No Content`: the client refetches what it shows.
      schema: { body: categoriesRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply.status(204).send(await saveCategories.execute(request.executionContext, request.body)),
  );
}
