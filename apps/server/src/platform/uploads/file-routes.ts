import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { showsInline } from '@toppo-tracker/core';
import type { AttachmentMediaType } from '@toppo-tracker/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { contentDisposition } from './content-disposition.ts';
import { type FileStorage, ReceivedFile } from './file-storage.ts';

/** A kept file, as a query finds it, to send. */
export interface StoredFile {
  storageKey: string;
  fileName: string;
  mediaType: AttachmentMediaType;
  size: number;
}

/**
 * The response schema of a route that answers a file (`reply.sendStoredFile`): streams are sent
 * as they are, never serialized.
 */
export const fileResponseSchema = z.custom<Readable>((value) => value instanceof Readable);

/** The response schema of a route that answers an image (`reply.sendImage`): sent as it is. */
export const imageResponseSchema = z.instanceof(Buffer);

/** The body of a route registered with `app.fileRoutes`. */
export const receivedFileSchema = z.instanceof(ReceivedFile);

/**
 * Whatever a stored file holds, the browser runs nothing of it: no script, no plugin, no form,
 * not even as a page of Toppo's origin (`sandbox`).
 */
const FILE_CSP = "default-src 'none'; sandbox";

declare module 'fastify' {
  interface FastifyInstance {
    /**
     * Registers routes whose body is one file, sent as `application/octet-stream` and nothing
     * else: once access is checked, it is written to disk within the size limit (`ReceivedFile`),
     * and removed after the response unless a command kept it.
     */
    fileRoutes(register: (routes: FastifyInstance) => void): void;
  }

  interface FastifyReply {
    /**
     * Sends a stored file: to download (`attachment`), or shown by the browser (`inline`), which
     * only images and PDFs are (`showsInline`).
     */
    sendStoredFile(file: StoredFile, disposition: 'attachment' | 'inline'): Promise<FastifyReply>;
    /**
     * Sends an image Toppo holds in memory (a plugin's logo), whose address changes with it:
     * shown, never run, and kept by the browser while its address holds.
     */
    sendImage(image: { bytes: Buffer; mediaType: 'image/png' | 'image/webp' }): FastifyReply;
  }
}

/** Lets features receive and send files, through `app.fileRoutes` and `reply.sendStoredFile`. */
export function registerFileRoutes(app: FastifyInstance, { files }: { files: FileStorage }): void {
  app.decorate('fileRoutes', function fileRoutes(this: FastifyInstance, register) {
    void this.register((scope, _options, done) => {
      // No JSON, no form here: a file, or a 415.
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        'application/octet-stream',
        (request: FastifyRequest, body: IncomingMessage) =>
          files.receive(body, request.headers['content-length']),
      );
      const discard = async (request: FastifyRequest) => {
        if (request.body instanceof ReceivedFile) {
          await files.discard(request.body);
        }
      };
      // As soon as a request fails too: a client gone before the answer means no response ends.
      scope.addHook('onError', discard);
      scope.addHook('onResponse', discard);
      register(scope);
      done();
    });
  });

  app.decorateReply('sendImage', function sendImage(this: FastifyReply, { bytes, mediaType }) {
    return this.header('content-type', mediaType)
      .header('content-length', bytes.length)
      .header('content-security-policy', FILE_CSP)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .send(bytes);
  });

  app.decorateReply(
    'sendStoredFile',
    async function sendStoredFile(this: FastifyReply, file, disposition) {
      if (disposition === 'inline' && !showsInline(file.mediaType)) {
        throw new Error('Only images and PDFs are shown inline');
      }
      const content = await files.open(file.storageKey);
      return this.header('content-type', file.mediaType)
        .header('content-length', file.size)
        .header('content-disposition', contentDisposition(disposition, file.fileName))
        .header('content-security-policy', FILE_CSP)
        .header(
          'cache-control',
          // A file shown is shown again and again, and never changes; a download stays out of caches.
          disposition === 'inline' ? 'private, max-age=86400' : 'private, no-store',
        )
        .send(content);
    },
  );
}
