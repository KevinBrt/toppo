import { type HealthResponse, healthResponseSchema } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from '../http/zod.ts';

export interface HealthDependencies {
  database: { ping(): Promise<void> };
  /** Upper bound for each check, so a stuck dependency cannot hang the probe. */
  checkTimeoutMs?: number;
}

const DEFAULT_CHECK_TIMEOUT_MS = 3000;

/** `GET /health`: 200 when Toppo can serve requests, 503 otherwise. Never exposes versions or errors. */
export function registerHealthRoute(
  app: FastifyInstance,
  { database, checkTimeoutMs = DEFAULT_CHECK_TIMEOUT_MS }: HealthDependencies,
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/health',
    {
      config: { access: 'public' },
      logLevel: 'warn',
      schema: { response: { 200: healthResponseSchema, 503: healthResponseSchema } },
    },
    async (request, reply) => {
      const databaseOk = await withTimeout(database.ping(), checkTimeoutMs).then(
        () => true,
        (error: unknown) => {
          request.log.warn({ err: error }, 'Health check: database unavailable');
          return false;
        },
      );

      const body: HealthResponse = {
        status: databaseOk ? 'ok' : 'error',
        checks: { database: databaseOk ? 'ok' : 'error' },
      };
      return reply
        .status(databaseOk ? 200 : 503)
        .header('cache-control', 'no-store')
        .send(body);
    },
  );
}

async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
