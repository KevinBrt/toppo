import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { apiErrorSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, setupTestDatabase, TEST_SETUP_CODE } from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;

const PASSWORD = 'correct horse battery staple';

function setupRequest(overrides: Record<string, unknown> = {}) {
  return {
    setupCode: TEST_SETUP_CODE,
    admin: { name: 'Ada Lovelace', email: 'Ada@Example.com', password: PASSWORD },
    ...overrides,
  };
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  return () => app.close();
});

describe('first-run setup', () => {
  it('is required on a fresh instance', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/setup' });

    expect(response.json()).toStrictEqual({ required: true });
  });

  it('refuses a wrong setup code', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      body: setupRequest({ setupCode: 'WRONG-CODE-0000' }),
    });

    expect(response.statusCode).toBe(403);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('INVALID_SETUP_CODE');
  });

  it('validates every field and explains what is wrong', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/setup',
      body: setupRequest({ admin: { name: '', email: 'not-an-email', password: 'short' } }),
    });

    expect(response.statusCode).toBe(400);
    const paths = apiErrorSchema.parse(response.json()).error.details?.map((detail) => detail.path);
    expect(paths?.sort()).toStrictEqual([
      'body.admin.email',
      'body.admin.name',
      'body.admin.password',
    ]);
  });

  it('lets only one of several simultaneous requests create the administrator', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/setup',
          body: setupRequest({
            admin: {
              name: `Admin ${index}`,
              email: `admin${index}@example.com`,
              password: PASSWORD,
            },
          }),
        }),
      ),
    );

    const statuses = responses.map((response) => response.statusCode).sort();
    expect(statuses).toStrictEqual([201, 409, 409, 409, 409]);
    const users = await context.database.db.select().from(schema.users);
    expect(users).toHaveLength(1);
  });

  it('gives the first user the administrator role and a hashed password', async () => {
    const [user] = await context.database.db.select().from(schema.users);
    const [account] = await context.database.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, user?.id ?? ''));

    expect(user?.instanceRoleId).toBe(DEFAULT_ROLE_IDS.administrator);
    expect(user?.email).toMatch(/^admin\d@example\.com$/);
    expect(account?.providerId).toBe('credential');
    expect(account?.password).toBeTruthy();
    expect(account?.password).not.toContain(PASSWORD);
  });

  it('keeps the default role names in English when no language is given', async () => {
    const names = await context.database.db.select({ name: schema.roles.name }).from(schema.roles);

    expect(names.map(({ name }) => name).sort()).toStrictEqual([
      'Administrator',
      'Requester',
      'Team',
    ]);
  });

  it('closes the wizard for good', async () => {
    const [settings] = await context.database.db.select().from(schema.instanceSettings);
    expect(settings?.setupCompletedAt).toBeInstanceOf(Date);

    const status = await app.inject({ method: 'GET', url: '/api/v1/setup' });
    expect(status.json()).toStrictEqual({ required: false });

    const again = await app.inject({ method: 'POST', url: '/api/v1/setup', body: setupRequest() });
    expect(again.statusCode).toBe(409);
    expect(apiErrorSchema.parse(again.json()).error.code).toBe('SETUP_ALREADY_COMPLETED');
  });
});
