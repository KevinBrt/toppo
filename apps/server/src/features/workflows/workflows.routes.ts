import {
  projectKeyParamsSchema,
  projectWorkflowResponseSchema,
  revertWorkflowRequestSchema,
  workflowRequestSchema,
  workflowResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { customizeProjectWorkflow } from './commands/customize-project-workflow.command.ts';
import { revertProjectWorkflow } from './commands/revert-project-workflow.command.ts';
import { saveProjectWorkflow } from './commands/save-project-workflow.command.ts';
import { saveWorkflow } from './commands/save-workflow.command.ts';
import { getProjectWorkflow } from './queries/get-project-workflow.query.ts';
import { getWorkflow } from './queries/get-workflow.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * The instance's workflow, read and saved whole by the settings (`instance.settings.manage`), and
 * each project's: the instance's it follows, or a copy of its own (`project.settings.manage`).
 */
export function registerWorkflowRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/workflow',
    {
      config: { access: getWorkflow.access },
      schema: { response: { 200: workflowResponseSchema } },
    },
    (request) => getWorkflow.execute(request.executionContext, {}),
  );

  routes.put(
    '/api/v1/workflow',
    {
      config: { access: saveWorkflow.access },
      schema: { body: workflowRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await saveWorkflow.execute(request.executionContext, request.body)),
  );

  registerProjectWorkflowRoutes(app);
}

/** A project's workflow: read, made its own, saved, and given back. */
function registerProjectWorkflowRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/projects/:projectKey/workflow',
    {
      config: { access: getProjectWorkflow.access },
      schema: { params: projectKeyParamsSchema, response: { 200: projectWorkflowResponseSchema } },
    },
    (request) => getProjectWorkflow.execute(request.executionContext, request.params),
  );

  routes.post(
    '/api/v1/projects/:projectKey/workflow/customize',
    {
      config: { access: customizeProjectWorkflow.access },
      schema: { params: projectKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await customizeProjectWorkflow.execute(request.executionContext, request.params)),
  );

  routes.put(
    '/api/v1/projects/:projectKey/workflow',
    {
      config: { access: saveProjectWorkflow.access },
      schema: { params: projectKeyParamsSchema, body: workflowRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(
        await saveProjectWorkflow.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.post(
    '/api/v1/projects/:projectKey/workflow/revert',
    {
      config: { access: revertProjectWorkflow.access },
      schema: {
        params: projectKeyParamsSchema,
        body: revertWorkflowRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await revertProjectWorkflow.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );
}
