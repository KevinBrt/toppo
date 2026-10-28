import {
  notificationsQuerySchema,
  notificationsResponseSchema,
  readNotificationsRequestSchema,
  unreadNotificationsResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { readNotifications } from './commands/read-notifications.command.ts';
import { countUnreadNotifications } from './queries/count-unread-notifications.query.ts';
import { listNotifications } from './queries/list-notifications.query.ts';

/** The caller's own notifications: each signed-in user reads and marks only theirs. */
export function registerNotificationRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/notifications',
    {
      config: { access: listNotifications.access },
      schema: {
        querystring: notificationsQuerySchema,
        response: { 200: notificationsResponseSchema },
      },
    },
    (request) => listNotifications.execute(request.executionContext, request.query),
  );

  routes.get(
    '/api/v1/notifications/unread-count',
    {
      config: { access: countUnreadNotifications.access },
      schema: { response: { 200: unreadNotificationsResponseSchema } },
    },
    (request) => countUnreadNotifications.execute(request.executionContext, {}),
  );

  routes.post(
    '/api/v1/notifications/read',
    {
      config: { access: readNotifications.access },
      // Answers `204 No Content`: the client refetches what it shows.
      schema: { body: readNotificationsRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await readNotifications.execute(request.executionContext, request.body)),
  );
}
