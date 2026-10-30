import type { ApiError } from '@toppo-tracker/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { HttpError } from './http-error.ts';
import { RequestValidationError } from './zod.ts';

const INTERNAL_ERROR: ApiError = {
  error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
};

/**
 * Maps every error to the shared `ApiError` envelope. Server errors are logged with their
 * stack but answered with a generic message: internals never reach the client.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof RequestValidationError) {
      return reply.status(400).send(validationErrorBody(error));
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Request failed');
      // One Toppo answers on purpose keeps its status (a plugin that failed: 502), not its words.
      return reply.status(error instanceof HttpError ? statusCode : 500).send(INTERNAL_ERROR);
    }

    const body: ApiError = {
      error: {
        code: error.code ?? 'REQUEST_ERROR',
        message: error.message,
        ...(error instanceof HttpError ? error.more : {}),
      },
    };
    return reply.status(statusCode).send(body);
  });
}

function validationErrorBody(error: RequestValidationError): ApiError {
  const part = error.validationContext ?? 'request';
  return {
    error: {
      code: 'VALIDATION_FAILED',
      message: 'The request is invalid',
      details: error.issues.map((issue) => ({
        path: [part, ...issue.path.map(String)].join('.'),
        message: issue.message,
      })),
    },
  };
}
