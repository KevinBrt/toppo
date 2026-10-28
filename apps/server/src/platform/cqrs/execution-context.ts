import type { Db } from '@toppo-tracker/db';
import type { FastifyInstance } from 'fastify';
import type { ExecutionContext, Services } from './cqrs.ts';

declare module 'fastify' {
  interface FastifyRequest {
    /** Context to run commands and queries with: the request's actor, logger and the app services. */
    readonly executionContext: ExecutionContext;
  }
}

/** Gives every request an execution context, so routes stay one line: `command.execute(request.executionContext, body)`. */
export function registerExecutionContext(
  app: FastifyInstance,
  { db, services }: { db: Db; services: Services },
): void {
  app.decorateRequest('executionContext', {
    getter() {
      return { db, actor: this.actor, project: this.project, log: this.log, services };
    },
  });
}
