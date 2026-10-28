import {
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  createInvitationsRequestSchema,
  createInvitationsResponseSchema,
  invitationIdParamsSchema,
  invitationLinkSchema,
  invitationPreviewRequestSchema,
  invitationPreviewResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RateLimit } from '../../platform/http/rate-limit.ts';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { acceptInvitation } from './commands/accept-invitation.command.ts';
import { createInvitations } from './commands/create-invitations.command.ts';
import { renewInvitation } from './commands/renew-invitation.command.ts';
import { revokeInvitation } from './commands/revoke-invitation.command.ts';
import { previewInvitation } from './queries/preview-invitation.query.ts';

/** Opening a link: a few reloads are normal. */
const PREVIEW_RATE_LIMIT: RateLimit = { max: 20, windowSeconds: 600 };
/** Accepting hashes a password: as strict as signing in. */
const ACCEPT_RATE_LIMIT: RateLimit = { max: 5, windowSeconds: 600 };

/**
 * Invitations: made and withdrawn by holders of `instance.users.manage`, listed with the members;
 * previewed and accepted by whoever holds the link, whose token travels in request bodies, never
 * in URLs.
 */
export function registerInvitationRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/api/v1/invitations',
    {
      config: { access: createInvitations.access },
      schema: {
        body: createInvitationsRequestSchema,
        response: { 201: createInvitationsResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createInvitations.execute(request.executionContext, request.body)),
  );

  routes.post(
    '/api/v1/invitations/:invitationId/renew',
    {
      config: { access: renewInvitation.access },
      schema: { params: invitationIdParamsSchema, response: { 200: invitationLinkSchema } },
    },
    (request) => renewInvitation.execute(request.executionContext, request.params),
  );

  routes.delete(
    '/api/v1/invitations/:invitationId',
    {
      config: { access: revokeInvitation.access },
      schema: { params: invitationIdParamsSchema, response: { 204: z.void() } },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await revokeInvitation.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/invitations/preview',
    {
      config: { access: previewInvitation.access, rateLimit: PREVIEW_RATE_LIMIT },
      schema: {
        body: invitationPreviewRequestSchema,
        response: { 200: invitationPreviewResponseSchema },
      },
    },
    (request) => previewInvitation.execute(request.executionContext, request.body),
  );

  routes.post(
    '/api/v1/invitations/accept',
    {
      config: { access: acceptInvitation.access, rateLimit: ACCEPT_RATE_LIMIT },
      schema: {
        body: acceptInvitationRequestSchema,
        response: { 201: acceptInvitationResponseSchema },
      },
    },
    async (request, reply) =>
      reply
        .status(201)
        .send(await acceptInvitation.execute(request.executionContext, request.body)),
  );
}
