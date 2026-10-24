import {
  createPropertyRequestSchema,
  createPropertyResponseSchema,
  projectFieldsSchema,
  projectIssuesParamsSchema,
  projectPropertiesResponseSchema,
  projectPropertyParamsSchema,
  propertiesResponseSchema,
  propertyAdaptationRequestSchema,
  propertyParamsSchema,
  updatePropertyRequestSchema,
} from '@toppo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { createProperty } from './commands/create-property.command.ts';
import { deleteProperty } from './commands/delete-property.command.ts';
import { adaptProjectProperty } from './commands/project/adapt-project-property.command.ts';
import { createProjectProperty } from './commands/project/create-project-property.command.ts';
import { deleteProjectProperty } from './commands/project/delete-project-property.command.ts';
import { saveProjectFields } from './commands/project/save-project-fields.command.ts';
import { updateProjectProperty } from './commands/project/update-project-property.command.ts';
import { updateProperty } from './commands/update-property.command.ts';
import { listProjectProperties } from './queries/list-project-properties.query.ts';
import { listProperties } from './queries/list-properties.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * The properties of the instance, edited in its settings by those who manage them, and how each
 * project adapts them, with its own, in its settings.
 */
export function registerPropertyRoutes(app: FastifyInstance): void {
  registerInstanceRoutes(app);
  registerProjectRoutes(app);
}

function registerInstanceRoutes(app: FastifyInstance): void {
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

function registerProjectRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/projects/:projectKey/properties',
    {
      config: { access: listProjectProperties.access },
      schema: {
        params: projectIssuesParamsSchema,
        response: { 200: projectPropertiesResponseSchema },
      },
    },
    (request) => listProjectProperties.execute(request.executionContext, request.params),
  );

  routes.put(
    '/api/v1/projects/:projectKey/fields',
    {
      config: { access: saveProjectFields.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: projectFieldsSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await saveProjectFields.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.post(
    '/api/v1/projects/:projectKey/properties',
    {
      config: { access: createProjectProperty.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: createPropertyRequestSchema,
        response: { 201: createPropertyResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(
        await createProjectProperty.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/projects/:projectKey/properties/:propertyId',
    {
      config: { access: updateProjectProperty.access },
      schema: {
        params: projectPropertyParamsSchema,
        body: updatePropertyRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateProjectProperty.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/projects/:projectKey/properties/:propertyId',
    {
      config: { access: deleteProjectProperty.access },
      schema: { params: projectPropertyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await deleteProjectProperty.execute(request.executionContext, request.params)),
  );

  routes.put(
    '/api/v1/projects/:projectKey/properties/:propertyId/adaptation',
    {
      config: { access: adaptProjectProperty.access },
      schema: {
        params: projectPropertyParamsSchema,
        body: propertyAdaptationRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await adaptProjectProperty.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );
}
