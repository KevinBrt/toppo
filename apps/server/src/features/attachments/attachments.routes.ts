import {
  addAttachmentResponseSchema,
  attachmentLimitsResponseSchema,
  attachmentParamsSchema,
  commentParamsSchema,
  FILE_NAME_HEADER,
  issueAttachmentsResponseSchema,
  issueKeyParamsSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { fileResponseSchema, receivedFileSchema } from '../../platform/uploads/file-routes.ts';
import { addAttachment } from './commands/add-attachment.command.ts';
import { deleteAttachment } from './commands/delete-attachment.command.ts';
import { fileUploadHeadersSchema } from './models/file-upload.model.ts';
import { downloadAttachment } from './queries/download-attachment.query.ts';
import { getAttachmentLimits } from './queries/get-attachment-limits.query.ts';
import { listAttachments } from './queries/list-attachments.query.ts';
import { previewAttachment } from './queries/preview-attachment.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * The files of an issue, named by its key: attached to its request or to one of its comments,
 * one per request (`application/octet-stream`, its name in `x-file-name`), downloaded, shown as
 * thumbnails when they are images, removed. An issue the caller does not see answers 404, as
 * does a file of another issue.
 */
export function registerAttachmentRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/attachments/limits',
    {
      config: { access: getAttachmentLimits.access },
      schema: { response: { 200: attachmentLimitsResponseSchema } },
    },
    (request) => getAttachmentLimits.execute(request.executionContext, {}),
  );

  routes.get(
    '/api/v1/issues/:issueKey/attachments',
    {
      config: { access: listAttachments.access },
      schema: { params: issueKeyParamsSchema, response: { 200: issueAttachmentsResponseSchema } },
    },
    (request) => listAttachments.execute(request.executionContext, request.params),
  );

  routes.get(
    '/api/v1/issues/:issueKey/attachments/:attachmentId/download',
    {
      config: { access: downloadAttachment.access },
      schema: { params: attachmentParamsSchema, response: { 200: fileResponseSchema } },
    },
    async (request, reply) =>
      reply.sendStoredFile(
        await downloadAttachment.execute(request.executionContext, request.params),
        'attachment',
      ),
  );

  routes.get(
    '/api/v1/issues/:issueKey/attachments/:attachmentId/preview',
    {
      config: { access: previewAttachment.access },
      schema: { params: attachmentParamsSchema, response: { 200: fileResponseSchema } },
    },
    async (request, reply) =>
      reply.sendStoredFile(
        await previewAttachment.execute(request.executionContext, request.params),
        'inline',
      ),
  );

  routes.delete(
    '/api/v1/issues/:issueKey/attachments/:attachmentId',
    {
      config: { access: deleteAttachment.access },
      schema: { params: attachmentParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await deleteAttachment.execute(request.executionContext, request.params)),
  );

  app.fileRoutes((scope) => {
    const uploads = scope.withTypeProvider<ZodTypeProvider>();

    uploads.post(
      '/api/v1/issues/:issueKey/attachments',
      {
        config: { access: addAttachment.access },
        schema: {
          params: issueKeyParamsSchema,
          headers: fileUploadHeadersSchema,
          body: receivedFileSchema,
          response: { 201: addAttachmentResponseSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(
          await addAttachment.execute(request.executionContext, {
            ...request.params,
            fileName: request.headers[FILE_NAME_HEADER],
            file: request.body,
          }),
        ),
    );

    uploads.post(
      '/api/v1/issues/:issueKey/comments/:commentId/attachments',
      {
        config: { access: addAttachment.access },
        schema: {
          params: commentParamsSchema,
          headers: fileUploadHeadersSchema,
          body: receivedFileSchema,
          response: { 201: addAttachmentResponseSchema },
        },
      },
      async (request, reply) =>
        reply.status(201).send(
          await addAttachment.execute(request.executionContext, {
            ...request.params,
            fileName: request.headers[FILE_NAME_HEADER],
            file: request.body,
          }),
        ),
    );
  });
}
