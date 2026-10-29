import type { ApiError } from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../http/http-error.ts';
import type { ZodTypeProvider } from '../../http/zod.ts';
import {
  FRAME_CSP,
  framePage,
  type ScreenBundles,
  type ScreenFrame,
  type ScreenRuntime,
  sendScreenScript,
} from './screen-files.ts';

declare module 'fastify' {
  interface FastifyReply {
    /** Sends the document of a screen's frame, under its CSP: the runtime, then the plugin's. */
    sendScreenFrame(frame: ScreenFrame): FastifyReply;
    /** Sends a plugin's screens' bundle, read from its zip. */
    sendScreenBundle(kept: { slug: string; sha256: string }): Promise<FastifyReply>;
  }
}

const NOT_FOUND: ApiError = { error: { code: 'NOT_FOUND', message: 'Not found' } };

/**
 * Serves what plugins' screens are made of: Toppo's runtime, at addresses that change with it,
 * and lets the plugins' routes send a screen's frame and its bundle.
 */
export function registerScreenRoutes(
  app: FastifyInstance,
  { runtime, bundles }: { runtime: ScreenRuntime | undefined; bundles: ScreenBundles },
): void {
  app.withTypeProvider<ZodTypeProvider>().get(
    '/plugin-runtime/:file',
    {
      config: { access: 'public' },
      schema: { params: z.object({ file: z.enum(['runtime.js', 'runtime.css']) }) },
    },
    (request, reply) => {
      const file = runtime?.file(request.params.file);
      return file
        ? sendScreenScript(reply, file.body, file.type)
        : reply.status(404).send(NOT_FOUND);
    },
  );

  app.decorateReply('sendScreenFrame', function sendScreenFrame(frame) {
    if (!runtime) {
      throw new HttpError(
        503,
        'SCREENS_UNAVAILABLE',
        'The runtime of plugins’ screens is not built',
      );
    }
    return this.header('content-type', 'text/html; charset=utf-8')
      .header('content-security-policy', FRAME_CSP)
      .header('cache-control', 'private, no-store')
      .header('referrer-policy', 'no-referrer')
      .send(framePage({ ...frame, runtimeVersion: runtime.version }));
  });

  app.decorateReply('sendScreenBundle', async function sendScreenBundle(kept) {
    const code = await bundles.read(kept);
    if (code === undefined) {
      throw new HttpError(404, 'SCREEN_NOT_FOUND', 'This plugin has no screens');
    }
    return sendScreenScript(this, code, 'text/javascript; charset=utf-8');
  });
}
