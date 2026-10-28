import {
  approvePluginRequestSchema,
  installPluginResponseSchema,
  PLUGIN_ACTION_INPUT_MAX_BYTES,
  pluginActionParamsSchema,
  pluginActionRequestSchema,
  pluginActionResponseSchema,
  pluginDetailsResponseSchema,
  pluginSlugParamsSchema,
  pluginsResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { packageBodySchema } from '../../platform/plugins/packages/package-routes.ts';
import { approvePlugin } from './commands/approve-plugin.command.ts';
import { disablePlugin } from './commands/disable-plugin.command.ts';
import { enablePlugin } from './commands/enable-plugin.command.ts';
import { installPlugin } from './commands/install-plugin.command.ts';
import { runPluginAction } from './commands/run-plugin-action.command.ts';
import { uninstallPlugin } from './commands/uninstall-plugin.command.ts';
import { getPlugin } from './queries/get-plugin.query.ts';
import { listPlugins } from './queries/list-plugins.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * A plugin runs one thing at a time on a server: a client running actions without end would keep
 * it from everyone else.
 */
const ACTION_RATE_LIMIT = { max: 60, windowSeconds: 60 };

/**
 * The plugins of the instance, named by their id: uploaded as a zip (`application/zip`),
 * approved in some projects or all, enabled, disabled, removed. Administrators only.
 */
export function registerPluginRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/plugins',
    {
      config: { access: listPlugins.access },
      schema: { response: { 200: pluginsResponseSchema } },
    },
    (request) => listPlugins.execute(request.executionContext, {}),
  );

  routes.get(
    '/api/v1/plugins/:pluginSlug',
    {
      config: { access: getPlugin.access },
      schema: { params: pluginSlugParamsSchema, response: { 200: pluginDetailsResponseSchema } },
    },
    (request) => getPlugin.execute(request.executionContext, request.params),
  );

  routes.post(
    '/api/v1/plugins/:pluginSlug/approve',
    {
      config: { access: approvePlugin.access },
      schema: {
        params: pluginSlugParamsSchema,
        body: approvePluginRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await approvePlugin.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.post(
    '/api/v1/plugins/:pluginSlug/enable',
    {
      config: { access: enablePlugin.access },
      schema: { params: pluginSlugParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await enablePlugin.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/plugins/:pluginSlug/disable',
    {
      config: { access: disablePlugin.access },
      schema: { params: pluginSlugParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await disablePlugin.execute(request.executionContext, request.params)),
  );

  routes.delete(
    '/api/v1/plugins/:pluginSlug',
    {
      config: { access: uninstallPlugin.access },
      schema: { params: pluginSlugParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await uninstallPlugin.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/plugins/:pluginSlug/actions/:action',
    {
      config: { access: runPluginAction.access, rateLimit: ACTION_RATE_LIMIT },
      bodyLimit: PLUGIN_ACTION_INPUT_MAX_BYTES,
      schema: {
        params: pluginActionParamsSchema,
        body: pluginActionRequestSchema,
        response: { 200: pluginActionResponseSchema },
      },
    },
    (request) =>
      runPluginAction.execute(request.executionContext, {
        ...request.params,
        input: request.body,
      }),
  );

  app.packageRoutes((scope) => {
    scope.withTypeProvider<ZodTypeProvider>().post(
      '/api/v1/plugins',
      {
        config: { access: installPlugin.access },
        schema: { body: packageBodySchema, response: { 201: installPluginResponseSchema } },
      },
      async (request, reply) =>
        reply
          .status(201)
          .send(await installPlugin.execute(request.executionContext, { zip: request.body })),
    );
  });
}
