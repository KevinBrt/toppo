import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  createPropertyResponseSchema,
  createRoleResponseSchema,
  type IssuePropertyValue,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
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
/** Requester: reports issues, changes none of their fields. */
let requesterCookie: string;
let requesterId: string;
/** A team member who does not reach the project. */
let outsiderId: string;
/** Version, asked at creation and required; Team, shown in the list only. */
const VERSION = { id: '', v12: '', v13: '' };
const TEAM = { id: '', web: '' };
/** Then one property of each other type. */
const PLATFORMS = { id: '', ios: '', android: '' };
const OTHERS = { reference: '', estimate: '', due: '', reviewer: '', blocking: '' };

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

const reportWith = (properties: Record<string, unknown>, cookie = adminCookie) =>
  call('POST', '/api/v1/projects/WEB/issues', cookie, { title: 'Crash on phones', properties });

async function report(properties: Record<string, unknown> = {}): Promise<string> {
  const response = await reportWith({ [VERSION.id]: VERSION.v12, ...properties });
  expect(response.statusCode, response.body).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

const setProperty = (key: string, propertyId: string, value: unknown, cookie = adminCookie) =>
  call('PUT', `/api/v1/issues/${key}/properties/${propertyId}`, cookie, { value });

/** A value as people read it: options and people by name. */
function shown(property: IssuePropertyValue): unknown {
  switch (property.type) {
    case 'list':
      return property.value.name;
    case 'multiSelect':
      return property.value.map(({ name }) => name);
    case 'user':
      return property.value.name;
    default:
      return property.value;
  }
}

async function valuesOf(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  return issueResponseSchema
    .parse(response.json())
    .properties.map((property) => [property.name, shown(property)]);
}

async function createProperty(body: object): Promise<string> {
  const response = await call('POST', '/api/v1/properties', adminCookie, {
    type: 'list',
    shownInList: false,
    askedAtCreation: false,
    required: false,
    ...body,
  });
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
  requesterId = await createTestUser(context.database, {
    name: 'Rita Client',
    email: 'rita@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.requester,
  });
  outsiderId = await createTestUser(context.database, {
    name: 'Otto Outside',
    email: 'otto@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
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
        userIds: [requesterId],
        roleId: null,
      })
    ).statusCode,
  ).toBe(204);
  VERSION.id = await createProperty({
    name: 'Version',
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
    options: [{ name: 'Web', color: 'pink' }],
  });
  PLATFORMS.id = await createProperty({
    name: 'Platforms',
    type: 'multiSelect',
    options: [
      { name: 'iOS', color: 'gray' },
      { name: 'Android', color: 'green' },
    ],
  });
  OTHERS.reference = await createProperty({ name: 'Reference', type: 'text' });
  OTHERS.estimate = await createProperty({ name: 'Estimate', type: 'number' });
  OTHERS.due = await createProperty({ name: 'Due', type: 'date' });
  OTHERS.reviewer = await createProperty({ name: 'Reviewer', type: 'user' });
  OTHERS.blocking = await createProperty({ name: 'Blocking', type: 'checkbox' });
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
  PLATFORMS.ios = optionOf(PLATFORMS.id, 'iOS');
  PLATFORMS.android = optionOf(PLATFORMS.id, 'Android');
  return () => app.close();
});

describe('the properties of an issue', () => {
  it('are offered by the forms, oldest first, with their type and what they ask', async () => {
    const fields = issueFieldsResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/issue-fields', requesterCookie)).json(),
    );

    expect(
      fields.properties.map(({ name, type, askedAtCreation, required, shownInList, options }) => ({
        name,
        type,
        askedAtCreation,
        required,
        shownInList,
        options: options.map((option) => option.name),
      })),
    ).toStrictEqual([
      {
        name: 'Version',
        type: 'list',
        askedAtCreation: true,
        required: true,
        shownInList: false,
        options: ['1.2', '1.3'],
      },
      {
        name: 'Team',
        type: 'list',
        askedAtCreation: false,
        required: false,
        shownInList: true,
        options: ['Web'],
      },
      {
        name: 'Platforms',
        type: 'multiSelect',
        askedAtCreation: false,
        required: false,
        shownInList: false,
        options: ['iOS', 'Android'],
      },
      ...['Reference', 'Estimate', 'Due', 'Reviewer', 'Blocking'].map((name, index) => ({
        name,
        type: (['text', 'number', 'date', 'user', 'checkbox'] as const)[index],
        askedAtCreation: false,
        required: false,
        shownInList: false,
        options: [],
      })),
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
      [{ [VERSION.id]: [VERSION.v12] }, 'INVALID_PROPERTY_VALUE'],
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

  it('take a value of each type, as stored, at creation or in place', async () => {
    const key = await report({
      [PLATFORMS.id]: [PLATFORMS.android, PLATFORMS.ios],
      [OTHERS.reference]: '  CUST-42 ',
      [OTHERS.estimate]: 2.5,
    });

    for (const [propertyId, value] of [
      [OTHERS.due, '2026-11-02'],
      [OTHERS.reviewer, requesterId],
      [OTHERS.blocking, true],
    ] as const) {
      const set = await setProperty(key, propertyId, value);
      expect(set.statusCode, set.body).toBe(204);
    }

    expect(await valuesOf(key)).toStrictEqual([
      ['Version', '1.2'],
      // In the order of the options, whatever the order chosen.
      ['Platforms', ['iOS', 'Android']],
      ['Reference', 'CUST-42'],
      ['Estimate', 2.5],
      ['Due', '2026-11-02'],
      ['Reviewer', 'Rita Client'],
      ['Blocking', true],
    ]);
  });

  it('refuse a value of another shape than the type of the property', async () => {
    const key = await report();

    for (const [propertyId, value] of [
      [PLATFORMS.id, PLATFORMS.ios],
      [PLATFORMS.id, [PLATFORMS.ios, PLATFORMS.ios]],
      [OTHERS.reference, 'First line\nSecond line'],
      [OTHERS.estimate, '3'],
      [OTHERS.due, '2026-02-30'],
      [OTHERS.reviewer, 'Rita'],
    ] as const) {
      const refused = await setProperty(key, propertyId, value);
      expect(refused.statusCode, JSON.stringify(value)).toBe(400);
      expect(errorCode(refused)).toBe('INVALID_PROPERTY_VALUE');
    }
    // Not even a value: no box is ever stored unticked.
    expect((await setProperty(key, OTHERS.blocking, false)).statusCode).toBe(400);
    expect(errorCode(await setProperty(key, PLATFORMS.id, [PLATFORMS.ios, VERSION.v12]))).toBe(
      'INVALID_PROPERTY_OPTION',
    );
  });

  it('name only someone who reaches the project', async () => {
    const key = await report();

    const outsider = await setProperty(key, OTHERS.reviewer, outsiderId);
    const atCreation = await reportWith({
      [VERSION.id]: VERSION.v12,
      [OTHERS.reviewer]: outsiderId,
    });

    expect(outsider.statusCode).toBe(400);
    expect(errorCode(outsider)).toBe('INVALID_PROPERTY_USER');
    expect(atCreation.statusCode).toBe(400);
    expect(errorCode(atCreation)).toBe('INVALID_PROPERTY_USER');
  });

  it('are changed and cleared in place, each change in the history', async () => {
    const key = await report();

    expect((await setProperty(key, VERSION.id, VERSION.v13)).statusCode).toBe(204);
    expect((await setProperty(key, TEAM.id, TEAM.web)).statusCode).toBe(204);
    expect((await setProperty(key, PLATFORMS.id, [PLATFORMS.ios])).statusCode).toBe(204);
    expect((await setProperty(key, OTHERS.reviewer, requesterId)).statusCode).toBe(204);
    expect((await setProperty(key, OTHERS.estimate, 3)).statusCode).toBe(204);
    expect((await setProperty(key, VERSION.id, null)).statusCode).toBe(204);
    // The same value changes nothing, the options of a multi-select in any order.
    expect((await setProperty(key, TEAM.id, TEAM.web)).statusCode).toBe(204);
    expect((await setProperty(key, PLATFORMS.id, [PLATFORMS.ios])).statusCode).toBe(204);

    expect(await valuesOf(key)).toStrictEqual([
      ['Team', 'Web'],
      ['Platforms', ['iOS']],
      ['Estimate', 3],
      ['Reviewer', 'Rita Client'],
    ]);
    const history = issueActivitiesResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}/activities`, adminCookie)).json(),
    );
    expect(
      history.rows.flatMap((row) => (row.type === 'issue.propertyChanged' ? [row.payload] : [])),
    ).toMatchObject([
      { type: 'list', property: { name: 'Version' }, from: { name: '1.3' }, to: null },
      { type: 'number', property: { name: 'Estimate' }, from: null, to: 3 },
      { type: 'user', property: { name: 'Reviewer' }, from: null, to: { name: 'Rita Client' } },
      { type: 'multiSelect', property: { name: 'Platforms' }, from: null, to: [{ name: 'iOS' }] },
      { type: 'list', property: { name: 'Team' }, from: null, to: { name: 'Web' } },
      { type: 'list', property: { name: 'Version' }, from: { name: '1.2' }, to: { name: '1.3' } },
    ]);
  });

  it('name someone only for those who may assign, never requiring it of the others', async () => {
    const role = createRoleResponseSchema.parse(
      (await call('POST', '/api/v1/roles', adminCookie, { name: 'Editor', color: 'blue' })).json(),
    ).id;
    const permissions = ['issue.read', 'issue.create', 'issue.update'];
    const saved = await call('PUT', '/api/v1/roles/permissions', adminCookie, {
      changes: [{ roleId: role, from: [], to: permissions }],
    });
    expect(saved.statusCode, saved.body).toBe(204);
    const editor = await createTestUser(context.database, {
      name: 'Eddie Editor',
      email: 'eddie@example.com',
      password: PASSWORD,
      instanceRoleId: role,
    });
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key: 'OPS', name: 'Operations' }))
        .statusCode,
    ).toBe(201);
    for (const project of ['WEB', 'OPS']) {
      const added = await call('POST', `/api/v1/projects/${project}/members`, adminCookie, {
        userIds: [editor],
        roleId: null,
      });
      expect(added.statusCode).toBe(204);
    }
    const owner = await call('POST', '/api/v1/projects/OPS/properties', adminCookie, {
      type: 'user',
      name: 'Owner',
      shownInList: false,
      askedAtCreation: true,
      required: true,
    });
    expect(owner.statusCode, owner.body).toBe(201);
    const editorCookie = await signIn('eddie@example.com');
    const key = await report();

    const named = await setProperty(key, OTHERS.reviewer, requesterId, editorCookie);
    const typed = await setProperty(key, OTHERS.estimate, 5, editorCookie);
    const namedAtCreation = await reportWith(
      { [VERSION.id]: VERSION.v12, [OTHERS.reviewer]: requesterId },
      editorCookie,
    );
    const ops = (cookie: string) =>
      call('POST', '/api/v1/projects/OPS/issues', cookie, {
        title: 'Disk full',
        properties: { [VERSION.id]: VERSION.v12 },
      });

    expect(named.statusCode).toBe(403);
    expect(typed.statusCode).toBe(204);
    expect(namedAtCreation.statusCode).toBe(403);
    expect((await ops(editorCookie)).statusCode).toBe(201);
    expect(errorCode(await ops(adminCookie))).toBe('PROPERTY_REQUIRED');
  });

  it('refuse a property that does not exist, and a requester', async () => {
    const key = await report();

    const unknown = await setProperty(key, '01a1569b-9900-7000-8000-00000000dead', null);
    const requester = await setProperty(key, TEAM.id, TEAM.web, requesterCookie);

    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('PROPERTY_NOT_FOUND');
    expect([403, 404]).toContain(requester.statusCode);
  });

  it('show in the list only those shown in it', async () => {
    const key = await report({ [TEAM.id]: TEAM.web, [OTHERS.estimate]: 1 });

    const list = issuesResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/issues', adminCookie)).json(),
    );

    expect(
      list.rows
        .find((row) => row.key === key)
        ?.properties.map((value) => [value.name, shown(value)]),
    ).toStrictEqual([['Team', 'Web']]);
  });
});

describe('the list filtered by property', () => {
  /** Issues of FLT, by title, and the keys a filter keeps of them. */
  const keys: Record<string, string> = {};

  async function keep(filter: string): Promise<string[]> {
    const response = await call(
      'GET',
      `/api/v1/projects/FLT/issues?property=${encodeURIComponent(filter)}&sort=title&order=asc`,
      adminCookie,
    );
    expect(response.statusCode, response.body).toBe(200);
    const titles = Object.fromEntries(Object.entries(keys).map(([title, key]) => [key, title]));
    return issuesResponseSchema.parse(response.json()).rows.map((row) => titles[row.key] ?? '');
  }

  beforeAll(async () => {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key: 'FLT', name: 'Filters' }))
        .statusCode,
    ).toBe(201);
    for (const [title, values] of [
      ['Alpha', { [TEAM.id]: TEAM.web, [OTHERS.estimate]: 2, [OTHERS.due]: '2026-11-02' }],
      ['Bravo', { [PLATFORMS.id]: [PLATFORMS.ios, PLATFORMS.android], [OTHERS.blocking]: true }],
      ['Charlie', { [PLATFORMS.id]: [PLATFORMS.ios], [OTHERS.estimate]: 5.5 }],
      ['Delta', { [OTHERS.due]: '2026-10-31', [OTHERS.estimate]: 5 }],
    ] as const) {
      const response = await call('POST', '/api/v1/projects/FLT/issues', adminCookie, {
        title,
        properties: { [VERSION.id]: VERSION.v12, ...values },
      });
      expect(response.statusCode, response.body).toBe(201);
      keys[title] = createIssueResponseSchema.parse(response.json()).key;
    }
  });

  it('keeps the issues with any of some options, or with none', async () => {
    expect(await keep(`${TEAM.id}:${TEAM.web}`)).toStrictEqual(['Alpha']);
    expect(await keep(`${TEAM.id}:none`)).toStrictEqual(['Bravo', 'Charlie', 'Delta']);
    expect(await keep(`${PLATFORMS.id}:${PLATFORMS.android}`)).toStrictEqual(['Bravo']);
    expect(await keep(`${PLATFORMS.id}:${PLATFORMS.ios},none`)).toStrictEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ]);
  });

  it('keeps the boxes ticked, or not', async () => {
    expect(await keep(`${OTHERS.blocking}:yes`)).toStrictEqual(['Bravo']);
    expect(await keep(`${OTHERS.blocking}:no`)).toStrictEqual(['Alpha', 'Charlie', 'Delta']);
  });

  it('keeps numbers and days within a range, its ends included', async () => {
    expect(await keep(`${OTHERS.estimate}:2..5`)).toStrictEqual(['Alpha', 'Delta']);
    expect(await keep(`${OTHERS.estimate}:5..`)).toStrictEqual(['Charlie', 'Delta']);
    expect(await keep(`${OTHERS.due}:2026-11-01..`)).toStrictEqual(['Alpha']);
    expect(await keep(`${OTHERS.due}:..2026-11-02`)).toStrictEqual(['Alpha', 'Delta']);
  });

  it('applies every filter at once', async () => {
    expect(await keep(`${PLATFORMS.id}:${PLATFORMS.ios};${OTHERS.estimate}:5..`)).toStrictEqual([
      'Charlie',
    ]);
  });

  it('refuses a filter its property cannot take, or one it does not have', async () => {
    const asked = (filter: string) =>
      call(
        'GET',
        `/api/v1/projects/FLT/issues?property=${encodeURIComponent(filter)}`,
        adminCookie,
      );

    const text = await asked(`${OTHERS.reference}:none`);
    const range = await asked(`${TEAM.id}:1..2`);
    const unknown = await asked('01a1569b-9900-7000-8000-00000000dead:none');
    const malformed = await asked(`${OTHERS.estimate}:..`);

    expect(errorCode(text)).toBe('INVALID_PROPERTY_FILTER');
    expect(errorCode(range)).toBe('INVALID_PROPERTY_FILTER');
    expect(errorCode(unknown)).toBe('PROPERTY_NOT_FOUND');
    expect(malformed.statusCode).toBe(400);
  });
});
