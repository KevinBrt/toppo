import { fileURLToPath } from 'node:url';
import { createDatabase, type Database } from '@toppo/db';
import { issueResponseSchema, issuesResponseSchema, projectsResponseSchema } from '@toppo/shared';
import { readSnapshots, restoreSnapshot } from '@toppo/testing';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, cookieHeader } from './test-helpers.ts';

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL('../../../packages/db/migrations', import.meta.url),
);
const SNAPSHOTS = fileURLToPath(new URL('../../../packages/db/snapshots', import.meta.url));
const ORIGIN = 'http://localhost:3000';
/** The accounts `npm run db:snapshot` opens, with the one password they all have. */
const ACCOUNTS = { admin: 'ada@example.com', team: 'grace@example.com' } as const;
const PASSWORD = 'correct horse battery staple';
/** Restoring a version's database, then every migration that came after it. */
const UPGRADING_TIMEOUT_MS = 60_000;

async function migrate(url: string, migrationsFolder: string): Promise<void> {
  const database = createDatabase({ url, maxConnections: 1 });
  try {
    await database.migrate(migrationsFolder);
  } finally {
    await database.close();
  }
}

const snapshots = await readSnapshots(SNAPSHOTS);

describe.each(snapshots)('a database of $name, upgraded', (snapshot) => {
  let database: Database;
  let app: FastifyInstance;

  beforeAll(async () => {
    const restored = await restoreSnapshot(snapshot, MIGRATIONS_FOLDER, migrate);
    database = createDatabase({ url: restored.url, maxConnections: 4 });
    await database.migrate(MIGRATIONS_FOLDER);
    app = await buildTestApp({ database });
  }, UPGRADING_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
    await database.close();
  });

  async function signIn(email: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      body: { email, password: PASSWORD },
    });
    expect(response.statusCode).toBe(200);
    return cookieHeader(response);
  }

  /** What `cookie` gets at `url`, which must be a success. */
  async function read(cookie: string, url: string): Promise<unknown> {
    const response = await app.inject({ method: 'GET', url, headers: { origin: ORIGIN, cookie } });
    expect(response.statusCode, `GET ${url}: ${response.body}`).toBe(200);
    return response.json();
  }

  it('lets its people sign in and work with what it holds', async () => {
    const admin = await signIn(ACCOUNTS.admin);
    const { rows: projects } = projectsResponseSchema.parse(
      await read(admin, '/api/v1/projects?state=active'),
    );
    expect(projects.length).toBeGreaterThan(0);

    for (const { key } of projects) {
      await read(admin, `/api/v1/projects/${key}`);
      await read(admin, `/api/v1/projects/${key}/issue-fields`);
      const { rows: issues } = issuesResponseSchema.parse(
        await read(admin, `/api/v1/projects/${key}/issues`),
      );
      for (const issue of issues) {
        issueResponseSchema.parse(await read(admin, `/api/v1/issues/${issue.key}`));
        await read(admin, `/api/v1/issues/${issue.key}/activities`);
      }
    }
    for (const url of [
      '/api/v1/me',
      '/api/v1/projects?state=archived',
      '/api/v1/issues/search?search=invoice',
      '/api/v1/issues/assigned',
      '/api/v1/notifications',
      '/api/v1/labels',
      '/api/v1/categories',
      '/api/v1/priorities',
      '/api/v1/properties',
      '/api/v1/roles',
      '/api/v1/workflow',
      '/api/v1/members',
    ]) {
      await read(admin, url);
    }

    const member = await signIn(ACCOUNTS.team);
    await read(member, '/api/v1/notifications');
    await read(member, '/api/v1/issues/assigned');
  });
});
