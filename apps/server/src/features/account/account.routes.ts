import {
  accountLocaleRequestSchema,
  emailNotificationsRequestSchema,
  updateAccountRequestSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { setAccountLocale } from './commands/set-account-locale.command.ts';
import { setEmailNotifications } from './commands/set-email-notifications.command.ts';
import { updateAccount } from './commands/update-account.command.ts';

/** One's own account. The password changes through Better Auth (`platform/auth/auth-routes.ts`). */
export function registerAccountRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.put(
    '/api/v1/me/locale',
    {
      config: { access: setAccountLocale.access },
      schema: { body: accountLocaleRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await setAccountLocale.execute(request.executionContext, request.body)),
  );

  routes.put(
    '/api/v1/me/email-notifications',
    {
      config: { access: setEmailNotifications.access },
      schema: { body: emailNotificationsRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await setEmailNotifications.execute(request.executionContext, request.body)),
  );

  routes.patch(
    '/api/v1/me',
    {
      config: { access: updateAccount.access },
      schema: { body: updateAccountRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply.status(204).send(await updateAccount.execute(request.executionContext, request.body)),
  );
}
