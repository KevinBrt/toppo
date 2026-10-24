import {
  addCommentResponseSchema,
  commentParamsSchema,
  commentRequestSchema,
  issueKeyParamsSchema,
  mentionableResponseSchema,
  pickerQuerySchema,
} from '@toppo/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { createComment } from './commands/create-comment.command.ts';
import { deleteComment } from './commands/delete-comment.command.ts';
import { editComment } from './commands/edit-comment.command.ts';
import { listMentionable } from './queries/list-mentionable.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * The comments of an issue, named by its key: written, edited and deleted here, read in its
 * history (`GET /api/v1/issues/:issueKey/activities`), and the people they may name. An issue
 * the caller does not see answers 404, as does a comment of another issue.
 */
export function registerCommentRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/api/v1/issues/:issueKey/comments',
    {
      config: { access: createComment.access },
      schema: {
        params: issueKeyParamsSchema,
        body: commentRequestSchema,
        response: { 201: addCommentResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(
        await createComment.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.get(
    '/api/v1/issues/:issueKey/mentionable',
    {
      config: { access: listMentionable.access },
      schema: {
        params: issueKeyParamsSchema,
        querystring: pickerQuerySchema,
        response: { 200: mentionableResponseSchema },
      },
    },
    (request) =>
      listMentionable.execute(request.executionContext, { ...request.params, ...request.query }),
  );

  routes.patch(
    '/api/v1/issues/:issueKey/comments/:commentId',
    {
      config: { access: editComment.access },
      schema: { params: commentParamsSchema, body: commentRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(
        await editComment.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/issues/:issueKey/comments/:commentId',
    {
      config: { access: deleteComment.access },
      schema: { params: commentParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteComment.execute(request.executionContext, request.params)),
  );
}
