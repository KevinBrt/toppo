import {
  createPropertyRequestSchema,
  createPropertyResponseSchema,
  propertiesResponseSchema,
  propertyParamsSchema,
  updatePropertyRequestSchema,
} from '@toppo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { createProperty } from './commands/create-property.command.ts';
import { deleteProperty } from './commands/delete-property.command.ts';
import { updateProperty } from './commands/update-property.command.ts';
import { listProperties } from './queries/list-properties.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** The properties of the instance, edited in the settings by those who manage them. */
export function registerPropertyRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/properties',
    {
      config: { access: listProperties.access },
      schema: { response: { 200: propertiesResponseSchema } },
    },
    (request) => listProperties.execute(request.executionContext, {}),
  );

  routes.post(
    '/api/v1/properties',
    {
      config: { access: createProperty.access },
      schema: {
        body: createPropertyRequestSchema,
        response: { 201: createPropertyResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(await createProperty.execute(request.executionContext, request.body)),
  );

  routes.put(
    '/api/v1/properties/:propertyId',
    {
      config: { access: updateProperty.access },
      schema: {
        params: propertyParamsSchema,
        body: updatePropertyRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateProperty.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/properties/:propertyId',
    {
      config: { access: deleteProperty.access },
      schema: { params: propertyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await deleteProperty.execute(request.executionContext, request.params)),
  );
}
