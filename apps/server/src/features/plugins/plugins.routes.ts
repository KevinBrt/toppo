import {
  approvePluginRequestSchema,
  installPluginResponseSchema,
  issueKeyParamsSchema,
  issuePanelsResponseSchema,
  PLUGIN_ACTION_INPUT_MAX_BYTES,
  PLUGIN_SETTINGS_MAX_BYTES,
  pluginActionParamsSchema,
  pluginActionRequestSchema,
  pluginActionResponseSchema,
  pluginDetailsResponseSchema,
  pluginPlacedScreensResponseSchema,
  pluginScreensResponseSchema,
  pluginSlugParamsSchema,
  pluginsResponseSchema,
  projectKeyParamsSchema,
  projectPluginParamsSchema,
  projectPluginsResponseSchema,
  savePluginSettingsRequestSchema,
  screenFrameParamsSchema,
  screenFrameQuerySchema,
  uninstallPluginQuerySchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { packageBodySchema } from '../../platform/plugins/packages/package-routes.ts';
import { imageResponseSchema } from '../../platform/uploads/file-routes.ts';
import { approvePlugin } from './commands/approve-plugin.command.ts';
import { disablePlugin } from './commands/disable-plugin.command.ts';
import { enablePlugin } from './commands/enable-plugin.command.ts';
import { installPlugin } from './commands/install-plugin.command.ts';
import { runPluginAction } from './commands/run-plugin-action.command.ts';
import { savePluginSettings } from './commands/settings/save-plugin-settings.command.ts';
import { saveProjectPluginSettings } from './commands/settings/save-project-plugin-settings.command.ts';
import { uninstallPlugin } from './commands/uninstall-plugin.command.ts';
import { getPlugin } from './queries/get-plugin.query.ts';
import { getPluginLogo } from './queries/get-plugin-logo.query.ts';
import { listPlugins } from './queries/list-plugins.query.ts';
import { listProjectPlugins } from './queries/list-project-plugins.query.ts';
import { getScreenBundle } from './queries/screens/get-screen-bundle.query.ts';
import { getScreenFrame } from './queries/screens/get-screen-frame.query.ts';
import { listIssuePanels } from './queries/screens/list-issue-panels.query.ts';
import { listPluginScreens } from './queries/screens/list-plugin-screens.query.ts';
import { listProjectScreens } from './queries/screens/list-project-screens.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * A plugin runs one thing at a time on a server: a client running actions without end would keep
 * it from everyone else. Its screens read through its actions as they show, a few at a time.
 */
const ACTION_RATE_LIMIT = { max: 300, windowSeconds: 60 };

/**
 * The plugins of the instance, named by their id: uploaded as a zip (`application/zip`), set up,
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

  routes.get(
    '/api/v1/plugin-screens',
    {
      config: { access: listPluginScreens.access },
      schema: { response: { 200: pluginScreensResponseSchema } },
    },
    (request) => listPluginScreens.execute(request.executionContext, {}),
  );

  routes.get(
    '/api/v1/projects/:projectKey/plugin-screens',
    {
      config: { access: listProjectScreens.access },
      schema: {
        params: projectKeyParamsSchema,
        response: { 200: pluginPlacedScreensResponseSchema },
      },
    },
    (request) => listProjectScreens.execute(request.executionContext, request.params),
  );

  routes.get(
    '/api/v1/issues/:issueKey/plugin-panels',
    {
      config: { access: listIssuePanels.access },
      schema: {
        params: issueKeyParamsSchema,
        response: { 200: issuePanelsResponseSchema },
      },
    },
    (request) => listIssuePanels.execute(request.executionContext, request.params),
  );

  // A screen's frame, then its bundle: documents for the browser, outside the API.
  routes.get(
    '/plugin-screens/:pluginSlug/web.js',
    {
      config: { access: getScreenBundle.access },
      schema: { params: pluginSlugParamsSchema },
    },
    async (request, reply) =>
      reply.sendScreenBundle(
        await getScreenBundle.execute(request.executionContext, request.params),
      ),
  );

  routes.get(
    '/plugin-screens/:pluginSlug/:screen',
    {
      config: { access: getScreenFrame.access },
      schema: { params: screenFrameParamsSchema, querystring: screenFrameQuerySchema },
    },
    async (request, reply) =>
      reply.sendScreenFrame(
        await getScreenFrame.execute(request.executionContext, {
          ...request.params,
          ...request.query,
        }),
      ),
  );

  routes.get(
    '/api/v1/plugins/:pluginSlug/logo',
    {
      config: { access: getPluginLogo.access },
      schema: { params: pluginSlugParamsSchema, response: { 200: imageResponseSchema } },
    },
    async (request, reply) =>
      reply.sendImage(await getPluginLogo.execute(request.executionContext, request.params)),
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

  routes.put(
    '/api/v1/plugins/:pluginSlug/settings',
    {
      config: { access: savePluginSettings.access },
      // The settings, and the object around them.
      bodyLimit: PLUGIN_SETTINGS_MAX_BYTES + 1024,
      schema: {
        params: pluginSlugParamsSchema,
        body: savePluginSettingsRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await savePluginSettings.execute(request.executionContext, {
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
      schema: {
        params: pluginSlugParamsSchema,
        querystring: uninstallPluginQuerySchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await uninstallPlugin.execute(request.executionContext, {
          ...request.params,
          ...request.query,
        }),
      ),
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

  registerProjectRoutes(app);

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

/**
 * The plugins at work in a project, as its settings show them: what the project sets for itself
 * of each. Those who manage the project's settings.
 */
function registerProjectRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/projects/:projectKey/plugins',
    {
      config: { access: listProjectPlugins.access },
      schema: { params: projectKeyParamsSchema, response: { 200: projectPluginsResponseSchema } },
    },
    (request) => listProjectPlugins.execute(request.executionContext, request.params),
  );

  routes.put(
    '/api/v1/projects/:projectKey/plugins/:pluginSlug/settings',
    {
      config: { access: saveProjectPluginSettings.access },
      // The settings, and the object around them.
      bodyLimit: PLUGIN_SETTINGS_MAX_BYTES + 1024,
      schema: {
        params: projectPluginParamsSchema,
        body: savePluginSettingsRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await saveProjectPluginSettings.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );
}
