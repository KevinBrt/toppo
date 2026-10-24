import { mailSettingsRequestSchema, mailSettingsResponseSchema } from '@toppo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RateLimit } from '../../platform/http/rate-limit.ts';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { removeMailSettings } from './commands/remove-mail-settings.command.ts';
import { saveMailSettings } from './commands/save-mail-settings.command.ts';
import { sendTestMail } from './commands/send-test-mail.command.ts';
import { getMailSettings } from './queries/get-mail-settings.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** Each test sends a real email: a few tries to get the settings right, not a way to spam. */
const TEST_RATE_LIMIT: RateLimit = { max: 5, windowSeconds: 600 };

/** How the instance sends email: read, saved, turned off and tested by its administrators. */
export function registerMailRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/settings/email',
    {
      config: { access: getMailSettings.access },
      schema: { response: { 200: mailSettingsResponseSchema } },
    },
    (request) => getMailSettings.execute(request.executionContext, {}),
  );

  routes.put(
    '/api/v1/settings/email',
    {
      config: { access: saveMailSettings.access },
      schema: { body: mailSettingsRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await saveMailSettings.execute(request.executionContext, request.body)),
  );

  routes.delete(
    '/api/v1/settings/email',
    { config: { access: removeMailSettings.access }, schema: { response: NO_CONTENT } },
    async (request, reply) =>
      reply.status(204).send(await removeMailSettings.execute(request.executionContext, {})),
  );

  routes.post(
    '/api/v1/settings/email/test',
    {
      config: { access: sendTestMail.access, rateLimit: TEST_RATE_LIMIT },
      schema: { response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await sendTestMail.execute(request.executionContext, {})),
  );
}
