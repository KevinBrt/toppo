import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import { type ApiError, CSP_NONCE_PLACEHOLDER } from '@toppo-tracker/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from './zod.ts';

const NOT_FOUND: ApiError = { error: { code: 'NOT_FOUND', message: 'Not found' } };

/** Paths that must never fall back to the single-page app. */
const NON_SPA_PREFIXES = ['/api/', '/assets/'];

/**
 * Serves the compiled web app: hashed assets with a one-year cache, root files (favicon…)
 * by exact name, and `index.html` for any other browser navigation so client-side routes work.
 * Returns false when the web app is not built (development, where Vite serves it).
 */
export async function registerWebApp(app: FastifyInstance, root: string): Promise<boolean> {
  const indexPath = join(root, 'index.html');
  if (!existsSync(indexPath)) {
    app.setNotFoundHandler(sendNotFound);
    return false;
  }

  await app.register(fastifyStatic, { root, serve: false });

  const indexHtml = readFileSync(indexPath, 'utf8');
  // Listed once at startup and matched by exact name: no user input ever reaches the file system path.
  const rootFiles = new Set(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name !== 'index.html')
      .map((entry) => entry.name),
  );

  app.withTypeProvider<ZodTypeProvider>().get(
    '/assets/*',
    {
      config: { access: 'public' },
      schema: { params: z.object({ '*': z.string() }) },
    },
    (request, reply) =>
      reply.sendFile(request.params['*'], join(root, 'assets'), {
        maxAge: '365d',
        immutable: true,
      }),
  );

  app.setNotFoundHandler((request, reply) => {
    if (!isBrowserNavigation(request)) {
      return sendNotFound(request, reply);
    }
    const fileName = new URL(request.url, 'http://localhost').pathname.slice(1);
    if (rootFiles.has(fileName)) {
      return reply.sendFile(fileName, { maxAge: '1d' });
    }
    // Every page carries the nonce of its own response; script tags also load through 'self'.
    return reply
      .header('cache-control', 'no-cache')
      .type('text/html; charset=utf-8')
      .send(indexHtml.replaceAll(CSP_NONCE_PLACEHOLDER, reply.cspNonce.style));
  });

  return true;
}

function isBrowserNavigation(request: FastifyRequest): boolean {
  const isReadMethod = request.method === 'GET' || request.method === 'HEAD';
  const isSpaPath = !NON_SPA_PREFIXES.some((prefix) => request.url.startsWith(prefix));
  return isReadMethod && isSpaPath;
}

function sendNotFound(_request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(404).send(NOT_FOUND);
}
