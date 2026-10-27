import { createServer, type Server, type Socket } from 'node:net';
import { schema } from '@toppo/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupTestDatabase, TEST_SECRET } from '../../test-helpers.ts';
import { createSecretBox } from '../config/secret-box.ts';
import { createMailer, MailError } from './mailer.ts';

const context = setupTestDatabase();
let silent: Server;
const sockets: Socket[] = [];

/** A server that takes the connection, then never says a word. */
beforeAll(async () => {
  silent = createServer((socket) => sockets.push(socket));
  await new Promise<void>((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const address = silent.address();
  await context.database.db.insert(schema.mailSettings).values({
    host: '127.0.0.1',
    port: typeof address === 'object' && address ? address.port : 0,
    security: 'none',
    fromAddress: 'toppo@example.com',
    fromName: 'Toppo',
  });
});

afterAll(async () => {
  for (const socket of sockets) {
    socket.destroy();
  }
  await new Promise((resolve) => silent.close(resolve));
});

describe('sending a message', () => {
  it('gives up within its deadline, however long the server keeps quiet', async () => {
    const mailer = createMailer(createSecretBox(TEST_SECRET), { deadlineMs: 200 });
    const sending = mailer.send(context.database.db, {
      to: { name: 'Ada', address: 'ada@example.com' },
      subject: 'Hello',
      text: 'Hello',
      html: '<p>Hello</p>',
    });

    await expect(sending).rejects.toBeInstanceOf(MailError);
    await expect(sending).rejects.toMatchObject({ reason: 'connection' });
  });
});
