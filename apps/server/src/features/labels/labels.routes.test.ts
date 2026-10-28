import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  issueResponseSchema,
  LABELS_MAX,
  type LabelsRequest,
  labelsResponseSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let teamCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST' | 'PUT', url: string, cookie: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: LightMyRequestResponse) =>
  apiErrorSchema.parse(response.json()).error.code;

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

async function stored() {
  const response = await call('GET', '/api/v1/labels', adminCookie);
  expect(response.statusCode).toBe(200);
  return labelsResponseSchema.parse(response.json()).labels;
}

const save = (request: LabelsRequest, cookie = adminCookie) =>
  call('PUT', '/api/v1/labels', cookie, request);

/** Saves the labels the list holds now, as `edit` changes it, removing those it names. */
async function edit(
  change: (labels: Awaited<ReturnType<typeof stored>>) => LabelsRequest['labels'],
  removed: string[] = [],
) {
  const response = await save({ labels: change(await stored()), removed });
  expect(response.statusCode, response.body).toBe(204);
}

const idOf = async (name: string) =>
  (await stored()).find((label) => label.name === name)?.id ?? '';

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  expect(
    (await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Website' }))
      .statusCode,
  ).toBe(201);
  return () => app.close();
});

describe('the labels of the instance', () => {
  it('are saved whole, then listed by name with how many issues have them', async () => {
    expect(await stored()).toStrictEqual([]);
    await edit(() => [
      { name: 'security', color: 'pink' },
      { name: 'Mobile', color: 'blue' },
      { name: 'billing', color: 'green' },
    ]);

    expect(
      (await stored()).map(({ name, color, issueCount }) => [name, color, issueCount]),
    ).toEqual([
      ['billing', 'green', 0],
      ['Mobile', 'blue', 0],
      ['security', 'pink', 0],
    ]);
  });

  it('are renamed and recolored, two of them even swapping names', async () => {
    const renamed: Record<string, string> = {
      billing: 'Mobile',
      Mobile: 'billing',
      security: 'Security',
    };
    await edit((labels) =>
      labels.map(({ id, name, color }) => ({
        id,
        name: renamed[name] ?? name,
        color: name === 'security' ? 'violet' : color,
      })),
    );

    expect((await stored()).map(({ name, color }) => [name, color])).toEqual([
      ['billing', 'blue'],
      ['Mobile', 'green'],
      ['Security', 'violet'],
    ]);
  });

  it('never share a name, whatever the case, nor exceed the limit', async () => {
    const twice = await save({
      labels: [
        { name: 'Docs', color: 'gray' },
        { name: 'DOCS', color: 'gray' },
      ],
      removed: (await stored()).map(({ id }) => id),
    });
    expect(twice.statusCode).toBe(400);
    const tooMany = await save({
      labels: Array.from({ length: LABELS_MAX + 1 }, (_, index) => ({
        name: `Label ${index}`,
        color: 'gray' as const,
      })),
      removed: [],
    });
    expect(tooMany.statusCode).toBe(400);
  });

  it('refuse a list made before someone else changed it', async () => {
    const seen = await stored();
    await edit((labels) => [...labels, { name: 'Docs', color: 'cyan' }]);

    const stale = await save({
      labels: seen.map(({ id, name, color }) => ({ id, name, color })),
      removed: [],
    });
    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('LABELS_CHANGED');
  });

  it('take a deleted label off its issues, each told in its history', async () => {
    const created = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
      title: 'Crash on phones',
    });
    const { key } = createIssueResponseSchema.parse(created.json());
    const mobile = await idOf('Mobile');
    const docs = await idOf('Docs');
    expect(
      (await call('PUT', `/api/v1/issues/${key}/labels`, adminCookie, { labelIds: [mobile, docs] }))
        .statusCode,
    ).toBe(204);
    expect((await stored()).find(({ id }) => id === mobile)?.issueCount).toBe(1);

    await edit((labels) => labels.filter(({ id }) => id !== mobile), [mobile]);

    const issue = issueResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}`, adminCookie)).json(),
    );
    expect(issue.labels.map(({ name }) => name)).toStrictEqual(['Docs']);
    const told = await context.database.db
      .select({ payload: schema.activities.payload })
      .from(schema.activities)
      .where(eq(schema.activities.type, 'issue.labelsChanged'));
    expect(told.at(-1)?.payload).toStrictEqual({
      added: [],
      removed: [{ id: mobile, name: 'Mobile' }],
    });
  });

  it('are edited by those who manage the settings only', async () => {
    expect((await call('GET', '/api/v1/labels', teamCookie)).statusCode).toBe(403);
    expect((await save({ labels: [], removed: [] }, teamCookie)).statusCode).toBe(403);
  });
});
