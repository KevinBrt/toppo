import { connect } from 'node:net';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildTestApp, createTestFileStorage } from '../../test-helpers.ts';
import { HttpError } from '../http/http-error.ts';
import type { ZodTypeProvider } from '../http/zod.ts';
import { receivedFileSchema } from './file-routes.ts';
import type { ReceivedFile } from './file-storage.ts';

let app: FastifyInstance;
let port: number;
const discarded: ReceivedFile[] = [];
/** Told once the route holds the whole file. */
let received: () => void = () => undefined;

beforeAll(async () => {
  const files = await createTestFileStorage();
  const discard = files.discard.bind(files);
  files.discard = async (file) => {
    discarded.push(file);
    await discard(file);
  };
  app = await buildTestApp({ files });
  app.fileRoutes((scope) => {
    scope.withTypeProvider<ZodTypeProvider>().post(
      '/api/test/refused-upload',
      {
        config: { access: 'public' },
        schema: { body: receivedFileSchema, response: { 204: z.null() } },
      },
      // Refused only once the client is gone: no response can be written any more.
      async (request) => {
        const gone = new Promise((resolve) => request.raw.socket.once('close', resolve));
        received();
        await gone;
        throw new HttpError(403, 'FORBIDDEN', 'Not here');
      },
    );
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  port = typeof address === 'object' && address ? address.port : 0;
});

afterAll(async () => {
  await app.close();
});

describe('a file refused', () => {
  it('is removed even when the client left before the answer', async () => {
    const body = 'a whole file, received';
    const held = new Promise<void>((resolve) => {
      received = resolve;
    });
    const socket = connect(port, '127.0.0.1');
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(
      [
        'POST /api/test/refused-upload HTTP/1.1',
        'Host: localhost',
        'Content-Type: application/octet-stream',
        `Content-Length: ${body.length}`,
        '',
        body,
      ].join('\r\n'),
    );
    await held;
    socket.destroy();

    await vi.waitFor(() => expect(discarded).toHaveLength(1));
  });
});
