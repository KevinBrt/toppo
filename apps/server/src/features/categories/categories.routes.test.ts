import { DEFAULT_CATEGORIES, DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import {
  apiErrorSchema,
  type CategoryDraft,
  categoriesResponseSchema,
  issueResponseSchema,
} from '@toppo-tracker/shared';
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
/** Team: works on issues, never on the settings. */
let teamCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function idOf(kind: string): string {
  const found = DEFAULT_CATEGORIES.find((category) => category.kind === kind);
  if (!found) {
    throw new Error(`No default ${kind}`);
  }
  return found.id;
}

const BUG = idOf('bug');
const REQUEST = idOf('request');
const QUESTION = idOf('question');

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

async function categories() {
  const response = await call('GET', '/api/v1/categories', adminCookie);
  expect(response.statusCode).toBe(200);
  return categoriesResponseSchema.parse(response.json()).categories;
}

const names = async () => (await categories()).map(({ name }) => name);

const save = (list: CategoryDraft[], removed: string[] = []) =>
  call('PUT', '/api/v1/categories', adminCookie, { categories: list, removed });

/** A category as it is stored now, to send back as part of the list. */
async function stored(id: string): Promise<CategoryDraft> {
  const found = (await categories()).find((category) => category.id === id);
  if (!found) {
    throw new Error(`No category ${id}`);
  }
  return { id, name: found.name, color: found.color, isDefault: found.isDefault };
}

/** Reports an issue in WEB, in the default category unless one is given; answers its category. */
async function report(categoryId?: string): Promise<string> {
  const created = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
    title: 'Broken link',
    ...(categoryId ? { categoryId } : {}),
  });
  expect(created.statusCode).toBe(201);
  const { key } = created.json<{ key: string }>();
  const issue = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  return issueResponseSchema.parse(issue.json()).category.id;
}

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
  const project = await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Web' });
  expect(project.statusCode).toBe(201);
  return () => app.close();
});

describe('categories routes', () => {
  it.each(['GET', 'PUT'] as const)(
    '%s needs a session, then the settings permission',
    async (method) => {
      const anonymous = await call(method, '/api/v1/categories', '', {});
      const member = await call(method, '/api/v1/categories', teamCookie, {});

      expect(anonymous.statusCode).toBe(401);
      expect(member.statusCode).toBe(403);
      expect(errorCode(member)).toBe('FORBIDDEN');
    },
  );

  it('lists the categories in their order, with how many issues each has', async () => {
    expect(await report(BUG)).toBe(BUG);

    expect(await categories()).toStrictEqual([
      { id: BUG, name: 'Bug', color: 'gray', isDefault: false, issueCount: 1 },
      { id: REQUEST, name: 'Request', color: 'gray', isDefault: true, issueCount: 0 },
      { id: QUESTION, name: 'Question', color: 'gray', isDefault: false, issueCount: 0 },
    ]);
  });
});

describe('saving the categories', () => {
  it('renames, recolors, reorders, adds and chooses the default at once', async () => {
    const response = await save([
      { name: 'Incident', color: 'pink', isDefault: true },
      { ...(await stored(QUESTION)), isDefault: false },
      { id: BUG, name: 'Defect', color: 'orange', isDefault: false },
      { ...(await stored(REQUEST)), isDefault: false },
    ]);

    expect(response.statusCode).toBe(204);
    expect(await categories()).toMatchObject([
      { name: 'Incident', color: 'pink', isDefault: true, issueCount: 0 },
      { id: QUESTION, name: 'Question', isDefault: false },
      { id: BUG, name: 'Defect', color: 'orange', issueCount: 1 },
      { id: REQUEST, name: 'Request', isDefault: false },
    ]);
    const [incident] = await categories();
    expect(await report()).toBe(incident?.id);
  });

  it('lets two categories swap their names', async () => {
    const list = await Promise.all((await categories()).map(({ id }) => stored(id)));
    const response = await save(
      list.map((category) => {
        if (category.name === 'Question') {
          return { ...category, name: 'Request' };
        }
        return category.name === 'Request' ? { ...category, name: 'Question' } : category;
      }),
    );

    expect(response.statusCode).toBe(204);
    expect((await stored(QUESTION)).name).toBe('Request');
    expect((await stored(REQUEST)).name).toBe('Question');
  });

  it('keeps a category issues still have, changing nothing at all', async () => {
    const before = await categories();
    const response = await save(
      (await Promise.all(before.map(({ id }) => stored(id))))
        .filter(({ id }) => id !== BUG)
        .map((category) => ({ ...category, color: 'violet' })),
      [BUG],
    );

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('CATEGORY_IN_USE');
    expect(await categories()).toStrictEqual(before);
  });

  it('deletes those it removes once no issue has them', async () => {
    const kept = (await Promise.all((await categories()).map(({ id }) => stored(id)))).filter(
      ({ id }) => id !== REQUEST,
    );
    const response = await save(kept, [REQUEST]);

    expect(response.statusCode).toBe(204);
    expect(await names()).toStrictEqual(['Incident', 'Request', 'Defect']);
  });

  it('never deletes one added meanwhile, which the list neither keeps nor removes', async () => {
    const [, ...stale] = await Promise.all((await categories()).map(({ id }) => stored(id)));
    const response = await save(
      stale.map((category, index) => ({ ...category, isDefault: index === 0 })),
    );

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('CATEGORIES_CHANGED');
    expect(await names()).toStrictEqual(['Incident', 'Request', 'Defect']);
  });

  it('refuses a category deleted meanwhile, kept and removed, a name twice, and no default', async () => {
    const list = await Promise.all((await categories()).map(({ id }) => stored(id)));
    const deleted = await save([
      ...list,
      { id: REQUEST, name: 'Back', color: 'gray', isDefault: false },
    ]);
    const both = await save(list, [BUG]);
    const twice = await save([...list, { name: 'defect', color: 'gray', isDefault: false }]);
    const noDefault = await save(list.map((category) => ({ ...category, isDefault: false })));

    expect(deleted.statusCode).toBe(409);
    expect(errorCode(deleted)).toBe('CATEGORIES_CHANGED');
    expect(both.statusCode).toBe(400);
    expect(twice.statusCode).toBe(400);
    expect(noDefault.statusCode).toBe(400);
    expect(await names()).toStrictEqual(['Incident', 'Request', 'Defect']);
  });
});
