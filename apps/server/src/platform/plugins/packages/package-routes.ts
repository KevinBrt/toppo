import type { IncomingMessage } from 'node:http';
import { PLUGIN_PACKAGE_LIMITS } from '@toppo-tracker/plugin-sdk/protocol';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../../http/http-error.ts';

/** The body of a route registered with `app.packageRoutes`. */
export const packageBodySchema = z.instanceof(Buffer);

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Registers routes whose body is a plugin's zip, sent as `application/zip` and nothing else:
     * once access is checked, it is read whole into memory, within the size of a package.
     */
    packageRoutes(register: (routes: FastifyInstance) => void): void;
  }
}

/** Lets the plugins feature receive packages, through `app.packageRoutes`. */
export function registerPackageRoutes(app: FastifyInstance): void {
  app.decorate('packageRoutes', function packageRoutes(this: FastifyInstance, register) {
    void this.register((scope, _options, done) => {
      // No JSON, no form here: a zip, or a 415.
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        'application/zip',
        (request: FastifyRequest, body: IncomingMessage) =>
          readPackage(body, request.headers['content-length']),
      );
      register(scope);
      done();
    });
  });
}

/**
 * Reads a package, refusing before a byte is read one without a length or too large; a browser
 * always sends a file with its length.
 */
async function readPackage(body: IncomingMessage, declared: string | undefined): Promise<Buffer> {
  if (declared === undefined || !/^\d+$/.test(declared)) {
    throw new HttpError(411, 'LENGTH_REQUIRED', 'Send the package with its length');
  }
  const length = Number(declared);
  if (length > PLUGIN_PACKAGE_LIMITS.packageBytes) {
    throw new HttpError(
      413,
      'PLUGIN_TOO_LARGE',
      `A plugin's zip may not exceed ${PLUGIN_PACKAGE_LIMITS.packageBytes} bytes`,
    );
  }
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    // Without an encoding set, a request body arrives as buffers.
    for await (const chunk of body as AsyncIterable<Buffer>) {
      size += chunk.length;
      chunks.push(chunk);
    }
  } catch {
    throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The package did not arrive whole');
  }
  // Node's parser stops a body at the length its request announced.
  if (size !== length) {
    throw new HttpError(400, 'UPLOAD_INCOMPLETE', 'The package did not arrive whole');
  }
  return Buffer.concat(chunks, size);
}
