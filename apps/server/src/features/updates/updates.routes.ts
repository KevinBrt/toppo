import { instanceVersionResponseSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { getVersion } from './queries/get-version.query.ts';

/** The version running, and a newer one for whoever manages the instance. */
export function registerUpdateRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/instance/version',
    {
      config: { access: getVersion.access },
      schema: { response: { 200: instanceVersionResponseSchema } },
    },
    (request) => getVersion.execute(request.executionContext, {}),
  );
}
