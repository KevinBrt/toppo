import {
  changePasswordRequestSchema,
  passwordResetAvailabilityResponseSchema,
  passwordResetRequestSchema,
  resetPasswordRequestSchema,
} from '@toppo/shared';
import { APIError } from 'better-auth/api';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../http/http-error.ts';
import type { RateLimit } from '../http/rate-limit.ts';
import type { ZodTypeProvider } from '../http/zod.ts';
import { AUTH_BASE_PATH, type Auth } from './auth.ts';
import {
  forwardSetCookies,
  sendFetchResponse,
  toFetchHeaders,
  toFetchRequest,
} from './fetch-bridge.ts';

/**
 * Better Auth endpoints Toppo exposes as they are. Everything else Better Auth offers (sign-up,
 * account deletion…) stays unreachable until a feature needs it; changing and resetting a
 * password go through routes of Toppo's own, below.
 */
const EXPOSED_ENDPOINTS: readonly { method: HTTPMethods; path: string }[] = [
  { method: 'POST', path: '/sign-in/email' },
  { method: 'POST', path: '/sign-out' },
  { method: 'GET', path: '/get-session' },
];

/** Changing one's password tests the current one: limited like signing in. */
const CHANGE_PASSWORD_RATE_LIMIT: RateLimit = { max: 5, windowSeconds: 600 };
/** Each request may send an email: a few tries, never a way to flood someone's inbox. */
const PASSWORD_RESET_REQUEST_RATE_LIMIT: RateLimit = { max: 3, windowSeconds: 900 };
/** Tries a token and hashes a password: limited like signing in. */
const RESET_PASSWORD_RATE_LIMIT: RateLimit = { max: 5, windowSeconds: 600 };

export function registerAuthRoutes(
  app: FastifyInstance,
  { auth, publicUrl }: { auth: Auth; publicUrl: URL },
): void {
  for (const { method, path } of EXPOSED_ENDPOINTS) {
    app.route({
      method,
      url: `${AUTH_BASE_PATH}${path}`,
      // Better Auth validates these requests and owns their responses.
      config: { access: 'public', delegated: true },
      handler: async (request, reply) =>
        sendFetchResponse(await auth.handler(toFetchRequest(request, publicUrl.origin)), reply),
    });
  }

  // Validated by Toppo, then by Better Auth, which checks the current password and answers
  // refusals itself. Every other device is signed out whatever the client asks, and the new
  // session's token stays in its HttpOnly cookie: success carries no body.
  app.withTypeProvider<ZodTypeProvider>().post(
    `${AUTH_BASE_PATH}/change-password`,
    {
      config: { access: 'authenticated', rateLimit: CHANGE_PASSWORD_RATE_LIMIT },
      schema: { body: changePasswordRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const response = await auth.handler(
        toFetchRequest(request, publicUrl.origin, { ...request.body, revokeOtherSessions: true }),
      );
      if (!response.ok) {
        return sendFetchResponse(response, reply);
      }
      forwardSetCookies(response.headers, reply);
      return reply.status(204).send();
    },
  );

  registerPasswordResetRoutes(app, auth);
}

/**
 * A forgotten password, reset by email when email is set up. Asking answers the same whether the
 * address has an account or not, so that nobody learns which addresses do; the link leaves from
 * the job queue (`password-reset-mail.ts`). Choosing the new password signs out every device.
 */
function registerPasswordResetRoutes(app: FastifyInstance, auth: Auth): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    `${AUTH_BASE_PATH}/password-reset`,
    {
      config: { access: 'public' },
      schema: { response: { 200: passwordResetAvailabilityResponseSchema } },
    },
    async (request) => {
      const { db, services } = request.executionContext;
      return { available: await services.mailer.isConfigured(db) };
    },
  );

  routes.post(
    `${AUTH_BASE_PATH}/request-password-reset`,
    {
      config: { access: 'public', rateLimit: PASSWORD_RESET_REQUEST_RATE_LIMIT },
      schema: { body: passwordResetRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      const { db, services } = request.executionContext;
      // Without email, no link could leave: none is made.
      if (await services.mailer.isConfigured(db)) {
        await auth.api.requestPasswordReset({
          body: { email: request.body.email },
          headers: toFetchHeaders(request),
        });
      }
      return reply.status(204).send();
    },
  );

  routes.post(
    `${AUTH_BASE_PATH}/reset-password`,
    {
      config: { access: 'public', rateLimit: RESET_PASSWORD_RATE_LIMIT },
      schema: { body: resetPasswordRequestSchema, response: { 204: z.void() } },
    },
    async (request, reply) => {
      try {
        await auth.api.resetPassword({ body: request.body, headers: toFetchHeaders(request) });
      } catch (error) {
        if (error instanceof APIError && error.body?.code === 'INVALID_TOKEN') {
          throw new HttpError(400, 'INVALID_RESET_LINK', 'This link has expired or was used');
        }
        throw error;
      }
      return reply.status(204).send();
    },
  );
}
