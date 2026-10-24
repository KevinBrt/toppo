import { DEFAULT_ROLE_IDS } from '@toppo/core';
import {
  apiErrorSchema,
  type CreatePropertyRequest,
  createIssueResponseSchema,
  createPropertyResponseSchema,
  issueActivitiesResponseSchema,
  issueResponseSchema,
  PROPERTIES_MAX,
  propertiesResponseSchema,
  type UpdatePropertyRequest,
} from '@toppo/shared';
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

function call(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  cookie: string,
  body?: object,
) {
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

async function listed() {
  const response = await call('GET', '/api/v1/properties', adminCookie);
  expect(response.statusCode).toBe(200);
  return propertiesResponseSchema.parse(response.json()).properties;
}

async function create(request: Partial<CreatePropertyRequest> & { name: string }): Promise<string> {
  const response = await call('POST', '/api/v1/properties', adminCookie, {
    type: 'list',
    shownInList: false,
    askedAtCreation: false,
    required: false,
    options: [{ name: '1.2', color: 'blue' }],
    ...request,
  });
  expect(response.statusCode, response.body).toBe(201);
  return createPropertyResponseSchema.parse(response.json()).id;
}

const save = (propertyId: string, request: UpdatePropertyRequest) =>
  call('PUT', `/api/v1/properties/${propertyId}`, adminCookie, request);

/** Reports an issue with these values, and the first option of each property required. */
async function report(properties: Record<string, unknown> = {}): Promise<string> {
  const required = (await listed()).flatMap(({ id, required: isRequired, options }) =>
    isRequired && options[0] ? [[id, options[0].id] as const] : [],
  );
  const response = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
    title: 'Broken export',
    properties: { ...Object.fromEntries(required), ...properties },
  });
  expect(response.statusCode, response.body).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function issue(key: string) {
  return issueResponseSchema.parse(
    (await call('GET', `/api/v1/issues/${key}`, adminCookie)).json(),
  );
}

async function lastStep(key: string) {
  const history = issueActivitiesResponseSchema.parse(
    (await call('GET', `/api/v1/issues/${key}/activities`, adminCookie)).json(),
  );
  return history.rows[0];
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
  expect(
    (await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Website' }))
      .statusCode,
  ).toBe(201);
  return () => app.close();
});

describe('the properties of the instance', () => {
  it('are created with their options, then listed oldest first', async () => {
    await create({
      name: 'Version',
      askedAtCreation: true,
      required: true,
      options: [
        { name: '1.2', color: 'blue' },
        { name: '1.3', color: 'green' },
      ],
    });
    await create({ name: 'Team', shownInList: true, options: [{ name: 'Web', color: 'pink' }] });

    const [version, team] = await listed();
    expect(version).toMatchObject({
      name: 'Version',
      type: 'list',
      shownInList: false,
      askedAtCreation: true,
      required: true,
    });
    expect(
      version?.options.map(({ name, color, issueCount }) => [name, color, issueCount]),
    ).toEqual([
      ['1.2', 'blue', 0],
      ['1.3', 'green', 0],
    ]);
    expect(team).toMatchObject({ name: 'Team', shownInList: true, askedAtCreation: false });
  });

  it('refuse a taken name, two options of one name, or a required property not asked', async () => {
    const taken = await call('POST', '/api/v1/properties', adminCookie, {
      type: 'list',
      name: 'version',
      shownInList: false,
      askedAtCreation: false,
      required: false,
      options: [{ name: 'A', color: 'gray' }],
    });
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe('PROPERTY_NAME_TAKEN');
    for (const wrong of [
      {
        options: [
          { name: 'A', color: 'gray' },
          { name: 'a', color: 'blue' },
        ],
      },
      { askedAtCreation: false, required: true },
      { options: [] },
    ]) {
      const refused = await call('POST', '/api/v1/properties', adminCookie, {
        type: 'list',
        name: 'Size',
        shownInList: false,
        askedAtCreation: false,
        required: false,
        options: [{ name: 'S', color: 'gray' }],
        ...wrong,
      });
      expect(refused.statusCode).toBe(400);
    }
  });

  it('save renames, colors, order and new options, a removed one leaving its issues', async () => {
    const id = await create({
      name: 'Customer',
      options: [
        { name: 'Acme', color: 'gray' },
        { name: 'Globex', color: 'gray' },
      ],
    });
    const [acme, globex] = (await listed()).find((row) => row.id === id)?.options ?? [];
    const key = await report({ [id]: acme?.id ?? '' });
    expect((await listed()).find((row) => row.id === id)?.options[0]?.issueCount).toBe(1);

    const saved = await save(id, {
      name: 'Client',
      shownInList: true,
      askedAtCreation: false,
      required: false,
      options: [
        { id: globex?.id, name: 'Acme', color: 'cyan' },
        { name: 'Initech', color: 'amber' },
      ],
      removed: [acme?.id ?? ''],
    });

    expect(saved.statusCode, saved.body).toBe(204);
    const property = (await listed()).find((row) => row.id === id);
    expect(property?.name).toBe('Client');
    expect(property?.options.map(({ name, color }) => [name, color])).toEqual([
      ['Acme', 'cyan'],
      ['Initech', 'amber'],
    ]);
    expect((await issue(key)).properties.some((value) => value.id === id)).toBe(false);
    expect(await lastStep(key)).toMatchObject({
      type: 'issue.propertyChanged',
      payload: { property: { name: 'Customer' }, from: { name: 'Acme' }, to: null },
    });
  });

  it('refuse a save made from options that changed meanwhile', async () => {
    const id = await create({ name: 'Browser', options: [{ name: 'Firefox', color: 'orange' }] });
    const [firefox] = (await listed()).find((row) => row.id === id)?.options ?? [];
    const fields = { name: 'Browser', shownInList: false, askedAtCreation: false, required: false };
    expect(
      (
        await save(id, {
          ...fields,
          options: [
            { id: firefox?.id, name: 'Firefox', color: 'orange' },
            { name: 'Safari', color: 'blue' },
          ],
          removed: [],
        })
      ).statusCode,
    ).toBe(204);

    const stale = await save(id, {
      ...fields,
      options: [{ id: firefox?.id, name: 'Firefox', color: 'orange' }],
      removed: [],
    });

    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('PROPERTY_CHANGED');
  });

  it('are deleted, their values leaving their issues, told in their history', async () => {
    const id = await create({ name: 'Sprint', options: [{ name: 'S1', color: 'violet' }] });
    const [first] = (await listed()).find((row) => row.id === id)?.options ?? [];
    const key = await report({ [id]: first?.id ?? '' });

    expect((await call('DELETE', `/api/v1/properties/${id}`, adminCookie)).statusCode).toBe(204);

    expect((await listed()).some((row) => row.id === id)).toBe(false);
    expect((await issue(key)).properties.some((value) => value.id === id)).toBe(false);
    expect(await lastStep(key)).toMatchObject({
      type: 'issue.propertyChanged',
      payload: { property: { name: 'Sprint' }, from: { name: 'S1' }, to: null },
    });
    expect((await call('DELETE', `/api/v1/properties/${id}`, adminCookie)).statusCode).toBe(404);
  });

  it('of a type without options are created without any, a checkbox never required', async () => {
    const id = await create({ name: 'Ticket ref', type: 'text', options: [] });
    expect((await listed()).find((row) => row.id === id)).toMatchObject({
      type: 'text',
      issueCount: 0,
      options: [],
    });

    for (const wrong of [
      { type: 'text', options: [{ name: 'A', color: 'gray' }] },
      { type: 'multiSelect', options: [] },
      { type: 'checkbox', options: [], askedAtCreation: true, required: true },
    ]) {
      const refused = await call('POST', '/api/v1/properties', adminCookie, {
        name: 'Odd',
        shownInList: false,
        askedAtCreation: false,
        required: false,
        ...wrong,
      });
      expect(refused.statusCode, JSON.stringify(wrong)).toBe(400);
    }
  });

  it('save as their type allows, which never changes', async () => {
    const text = await create({ name: 'Reference', type: 'text', options: [] });
    const box = await create({ name: 'Blocking', type: 'checkbox', options: [] });
    const list = await create({ name: 'Edition', options: [{ name: 'Pro', color: 'gray' }] });
    const fields = { shownInList: false, askedAtCreation: true, required: false, removed: [] };

    const optionsOnText = await save(text, {
      ...fields,
      name: 'Reference',
      options: [{ name: 'A', color: 'gray' }],
    });
    const requiredBox = await save(box, {
      ...fields,
      name: 'Blocking',
      required: true,
      options: [],
    });
    const emptyList = await save(list, { ...fields, name: 'Edition', options: [] });

    expect(errorCode(optionsOnText)).toBe('PROPERTY_WITHOUT_OPTIONS');
    expect(errorCode(requiredBox)).toBe('CHECKBOX_NOT_REQUIRED');
    expect(errorCode(emptyList)).toBe('PROPERTY_OPTIONS_REQUIRED');
    expect((await save(text, { ...fields, name: 'Ref', options: [] })).statusCode).toBe(204);
    expect((await listed()).find((row) => row.id === text)).toMatchObject({
      name: 'Ref',
      type: 'text',
    });
  });

  it("take a multi-select's removed option off its issues, keeping their others", async () => {
    const id = await create({
      name: 'Platforms',
      type: 'multiSelect',
      options: [
        { name: 'iOS', color: 'gray' },
        { name: 'Android', color: 'green' },
      ],
    });
    const [ios, android] = (await listed()).find((row) => row.id === id)?.options ?? [];
    const key = await report({ [id]: [ios?.id, android?.id] });
    expect((await listed()).find((row) => row.id === id)).toMatchObject({
      issueCount: 1,
      options: [{ issueCount: 1 }, { issueCount: 1 }],
    });

    const saved = await save(id, {
      name: 'Platforms',
      shownInList: false,
      askedAtCreation: false,
      required: false,
      options: [{ id: android?.id, name: 'Android', color: 'green' }],
      removed: [ios?.id ?? ''],
    });

    expect(saved.statusCode, saved.body).toBe(204);
    expect((await issue(key)).properties.find((value) => value.id === id)).toMatchObject({
      type: 'multiSelect',
      value: [{ name: 'Android' }],
    });
    expect(await lastStep(key)).toMatchObject({
      type: 'issue.propertyChanged',
      payload: {
        type: 'multiSelect',
        from: [{ name: 'iOS' }, { name: 'Android' }],
        to: [{ name: 'Android' }],
      },
    });
  });

  it('are deleted whatever their type, their values leaving their issues', async () => {
    const id = await create({ name: 'Due', type: 'date', options: [] });
    const key = await report({ [id]: '2026-11-02' });
    expect((await listed()).find((row) => row.id === id)?.issueCount).toBe(1);

    expect((await call('DELETE', `/api/v1/properties/${id}`, adminCookie)).statusCode).toBe(204);

    expect((await issue(key)).properties.some((value) => value.id === id)).toBe(false);
    expect(await lastStep(key)).toMatchObject({
      type: 'issue.propertyChanged',
      payload: { type: 'date', property: { name: 'Due' }, from: '2026-11-02', to: null },
    });
  });

  it('are kept from those who do not manage the settings', async () => {
    expect((await call('GET', '/api/v1/properties', teamCookie)).statusCode).toBe(403);
  });

  it(`stop at ${PROPERTIES_MAX}`, async () => {
    for (let index = (await listed()).length; index < PROPERTIES_MAX; index += 1) {
      await create({ name: `Property ${index}` });
    }

    const refused = await call('POST', '/api/v1/properties', adminCookie, {
      type: 'list',
      name: 'One too many',
      shownInList: false,
      askedAtCreation: false,
      required: false,
      options: [{ name: 'A', color: 'gray' }],
    });

    expect(refused.statusCode).toBe(409);
    expect(errorCode(refused)).toBe('PROPERTY_LIMIT_REACHED');
  });
});
