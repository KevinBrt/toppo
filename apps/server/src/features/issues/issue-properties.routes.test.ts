import { DEFAULT_ROLE_IDS } from '@toppo/core';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  createPropertyResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
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
/** Requester: reports issues, changes none of their fields. */
let requesterCookie: string;
/** Version, asked at creation and required; Team, shown in the list only. */
const VERSION = { id: '', v12: '', v13: '' };
const TEAM = { id: '', web: '' };

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

const reportWith = (properties: Record<string, string>, cookie = adminCookie) =>
  call('POST', '/api/v1/projects/WEB/issues', cookie, { title: 'Crash on phones', properties });

async function report(properties: Record<string, string> = {}): Promise<string> {
  const response = await reportWith({ [VERSION.id]: VERSION.v12, ...properties });
  expect(response.statusCode, response.body).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

const setProperty = (
  key: string,
  propertyId: string,
  optionId: string | null,
  cookie = adminCookie,
) => call('PUT', `/api/v1/issues/${key}/properties/${propertyId}`, cookie, { optionId });

async function valuesOf(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  return issueResponseSchema
    .parse(response.json())
    .properties.map(({ name, option }) => [name, option.name]);
}

async function createProperty(body: object): Promise<string> {
  const response = await call('POST', '/api/v1/properties', adminCookie, { type: 'list', ...body });
  expect(response.statusCode, response.body).toBe(201);
  return createPropertyResponseSchema.parse(response.json()).id;
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
  const requester = await createTestUser(context.database, {
    name: 'Rita Client',
    email: 'rita@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.requester,
  });
  adminCookie = await signIn('ada@example.com');
  requesterCookie = await signIn('rita@example.com');
  expect(
    (await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Website' }))
      .statusCode,
  ).toBe(201);
  expect(
    (
      await call('POST', '/api/v1/projects/WEB/members', adminCookie, {
        userIds: [requester],
        roleId: null,
      })
    ).statusCode,
  ).toBe(204);
  VERSION.id = await createProperty({
    name: 'Version',
    shownInList: false,
    askedAtCreation: true,
    required: true,
    options: [
      { name: '1.2', color: 'blue' },
      { name: '1.3', color: 'green' },
    ],
  });
  TEAM.id = await createProperty({
    name: 'Team',
    shownInList: true,
    askedAtCreation: false,
    required: false,
    options: [{ name: 'Web', color: 'pink' }],
  });
  const fields = issueFieldsResponseSchema.parse(
    (await call('GET', '/api/v1/projects/WEB/issue-fields', adminCookie)).json(),
  );
  const optionOf = (propertyId: string, name: string) =>
    fields.properties
      .find(({ id }) => id === propertyId)
      ?.options.find((option) => option.name === name)?.id ?? '';
  VERSION.v12 = optionOf(VERSION.id, '1.2');
  VERSION.v13 = optionOf(VERSION.id, '1.3');
  TEAM.web = optionOf(TEAM.id, 'Web');
  return () => app.close();
});

describe('the properties of an issue', () => {
  it('are offered by the forms, oldest first, with what they ask', async () => {
    const fields = issueFieldsResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/issue-fields', requesterCookie)).json(),
    );

    expect(
      fields.properties.map(({ name, askedAtCreation, required, shownInList, options }) => ({
        name,
        askedAtCreation,
        required,
        shownInList,
        options: options.map((option) => option.name),
      })),
    ).toStrictEqual([
      {
        name: 'Version',
        askedAtCreation: true,
        required: true,
        shownInList: false,
        options: ['1.2', '1.3'],
      },
      {
        name: 'Team',
        askedAtCreation: false,
        required: false,
        shownInList: true,
        options: ['Web'],
      },
    ]);
  });

  it('are given at creation, those required checked by the server', async () => {
    const key = await report({ [TEAM.id]: TEAM.web });
    expect(await valuesOf(key)).toStrictEqual([
      ['Version', '1.2'],
      ['Team', 'Web'],
    ]);

    for (const [values, code] of [
      [{}, 'PROPERTY_REQUIRED'],
      [{ [VERSION.id]: TEAM.web }, 'INVALID_PROPERTY_OPTION'],
      [
        { [VERSION.id]: VERSION.v12, '01a1569b-9900-7000-8000-00000000dead': VERSION.v12 },
        'PROPERTY_NOT_FOUND',
      ],
    ] as const) {
      const refused = await reportWith(values);
      expect(refused.statusCode).toBe(400);
      expect(errorCode(refused)).toBe(code);
    }
  });

  it('are changed and cleared in place, each change in the history', async () => {
    const key = await report();

    expect((await setProperty(key, VERSION.id, VERSION.v13)).statusCode).toBe(204);
    expect((await setProperty(key, TEAM.id, TEAM.web)).statusCode).toBe(204);
    expect((await setProperty(key, VERSION.id, null)).statusCode).toBe(204);
    // The same value changes nothing.
    expect((await setProperty(key, TEAM.id, TEAM.web)).statusCode).toBe(204);

    expect(await valuesOf(key)).toStrictEqual([['Team', 'Web']]);
    const history = issueActivitiesResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}/activities`, adminCookie)).json(),
    );
    expect(
      history.rows.flatMap((row) =>
        row.type === 'issue.propertyChanged'
          ? [
              [
                row.payload.property.name,
                row.payload.from?.name ?? null,
                row.payload.to?.name ?? null,
              ],
            ]
          : [],
      ),
    ).toStrictEqual([
      ['Version', '1.3', null],
      ['Team', null, 'Web'],
      ['Version', '1.2', '1.3'],
    ]);
  });

  it('refuse an option of another property, a property that does not exist, and a requester', async () => {
    const key = await report();

    const wrongOption = await setProperty(key, VERSION.id, TEAM.web);
    const unknown = await setProperty(key, '01a1569b-9900-7000-8000-00000000dead', null);
    const requester = await setProperty(key, TEAM.id, TEAM.web, requesterCookie);

    expect(wrongOption.statusCode).toBe(400);
    expect(errorCode(wrongOption)).toBe('INVALID_PROPERTY_OPTION');
    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('PROPERTY_NOT_FOUND');
    expect([403, 404]).toContain(requester.statusCode);
  });

  it('show in the list only those shown in it', async () => {
    const key = await report({ [TEAM.id]: TEAM.web });

    const list = issuesResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/issues', adminCookie)).json(),
    );

    expect(
      list.rows
        .find((row) => row.key === key)
        ?.properties.map(({ name, option }) => [name, option.name]),
    ).toStrictEqual([['Team', 'Web']]);
  });
});
