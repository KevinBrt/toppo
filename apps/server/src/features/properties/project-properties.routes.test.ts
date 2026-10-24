import {
  apiErrorSchema,
  createIssueResponseSchema,
  createPropertyResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  projectPropertiesResponseSchema,
  propertiesResponseSchema,
} from '@toppo/shared';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  cookieHeader,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let cookie: string;
/** Version: 1.2 and 1.3; Team: Web. Both of the instance. */
const VERSION = { id: '', v12: '', v13: '' };
const TEAM = { id: '', web: '' };

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: LightMyRequestResponse) =>
  apiErrorSchema.parse(response.json()).error.code;

async function adaptations(project: string) {
  const response = await call('GET', `/api/v1/projects/${project}/properties`);
  expect(response.statusCode).toBe(200);
  return projectPropertiesResponseSchema.parse(response.json());
}

async function fieldsOf(project: string) {
  return issueFieldsResponseSchema.parse(
    (await call('GET', `/api/v1/projects/${project}/issue-fields`)).json(),
  );
}

/** The properties a project's forms offer, each with its options, by name. */
async function offered(project: string) {
  return (await fieldsOf(project)).properties.map(({ name, options }) => [
    name,
    options.map((option) => option.name),
  ]);
}

async function report(project: string, properties: Record<string, string> = {}, extra = {}) {
  const response = await call('POST', `/api/v1/projects/${project}/issues`, {
    title: 'Broken export',
    properties,
    ...extra,
  });
  expect(response.statusCode, response.body).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function valuesOf(key: string) {
  return issueResponseSchema
    .parse((await call('GET', `/api/v1/issues/${key}`)).json())
    .properties.map(({ name, option }) => [name, option.name]);
}

const adapt = (project: string, propertyId: string, body: object) =>
  call('PUT', `/api/v1/projects/${project}/properties/${propertyId}/adaptation`, body);

async function createProperty(url: string, name: string, options: string[]): Promise<string> {
  const response = await call('POST', url, {
    type: 'list',
    name,
    shownInList: false,
    askedAtCreation: false,
    required: false,
    options: options.map((option) => ({ name: option, color: 'blue' })),
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
  const signIn = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email: 'ada@example.com', password: PASSWORD },
  });
  cookie = cookieHeader(signIn);
  for (const key of ['WEB', 'API']) {
    expect((await call('POST', '/api/v1/projects', { key, name: key })).statusCode).toBe(201);
  }
  VERSION.id = await createProperty('/api/v1/properties', 'Version', ['1.2', '1.3']);
  TEAM.id = await createProperty('/api/v1/properties', 'Team', ['Web']);
  const fields = await fieldsOf('WEB');
  const optionOf = (propertyId: string, name: string) =>
    fields.properties
      .find(({ id }) => id === propertyId)
      ?.options.find((option) => option.name === name)?.id ?? '';
  VERSION.v12 = optionOf(VERSION.id, '1.2');
  VERSION.v13 = optionOf(VERSION.id, '1.3');
  TEAM.web = optionOf(TEAM.id, 'Web');
  return () => app.close();
});

describe('a project', () => {
  it("takes the instance's properties as they are, until it adapts them", async () => {
    const { fields, instance, own } = await adaptations('WEB');

    expect(fields).toStrictEqual({
      category: { hidden: false, required: false },
      priority: { hidden: false, required: false },
    });
    expect(instance.map(({ name, hidden, ownOptions }) => [name, hidden, ownOptions])).toEqual([
      ['Version', false, false],
      ['Team', false, false],
    ]);
    expect(own).toStrictEqual([]);
  });

  it('hides a property of the instance, its values kept for when it shows again', async () => {
    const key = await report('WEB', { [TEAM.id]: TEAM.web });

    expect((await adapt('WEB', TEAM.id, { hidden: true, options: null })).statusCode).toBe(204);
    expect((await offered('WEB')).map(([name]) => name)).toEqual(['Version']);
    expect((await offered('API')).map(([name]) => name)).toEqual(['Version', 'Team']);
    expect(await valuesOf(key)).toStrictEqual([]);
    const hidden = await call('PUT', `/api/v1/issues/${key}/properties/${TEAM.id}`, {
      optionId: TEAM.web,
    });
    expect(hidden.statusCode).toBe(404);

    expect((await adapt('WEB', TEAM.id, { hidden: false, options: null })).statusCode).toBe(204);
    expect(await valuesOf(key)).toStrictEqual([['Team', 'Web']]);
  });

  it("takes options of its own from copies of the instance's, its issues moved onto them", async () => {
    const kept = await report('WEB', { [VERSION.id]: VERSION.v12 });
    const dropped = await report('WEB', { [VERSION.id]: VERSION.v13 });
    const elsewhere = await report('API', { [VERSION.id]: VERSION.v13 });

    const own = await adapt('WEB', VERSION.id, {
      hidden: false,
      options: {
        options: [
          { id: VERSION.v12, name: '1.2', color: 'blue' },
          { name: '2.0', color: 'green' },
        ],
        removed: [VERSION.v13],
      },
    });

    expect(own.statusCode, own.body).toBe(204);
    expect(await offered('WEB')).toContainEqual(['Version', ['1.2', '2.0']]);
    expect(await offered('API')).toContainEqual(['Version', ['1.2', '1.3']]);
    expect(await valuesOf(kept)).toContainEqual(['Version', '1.2']);
    expect(await valuesOf(dropped)).not.toContainEqual(['Version', '1.3']);
    expect(await valuesOf(elsewhere)).toContainEqual(['Version', '1.3']);
    const instance = propertiesResponseSchema.parse(
      (await call('GET', '/api/v1/properties')).json(),
    );
    expect(instance.properties[0]?.options.map(({ name }) => name)).toEqual(['1.2', '1.3']);
  });

  it("changes its own options freely, then takes the instance's again, its issues losing theirs", async () => {
    const { instance } = await adaptations('WEB');
    const version = instance.find(({ id }) => id === VERSION.id);
    expect(version?.ownOptions).toBe(true);
    const [copy] = version?.options ?? [];
    const key = await report('WEB', { [VERSION.id]: copy?.id ?? '' });

    const renamed = await adapt('WEB', VERSION.id, {
      hidden: false,
      options: {
        options: (version?.options ?? []).map(({ id, name, color }) => ({
          id,
          name: name === '1.2' ? '1.2.1' : name,
          color,
        })),
        removed: [],
      },
    });
    expect(renamed.statusCode, renamed.body).toBe(204);
    expect(await valuesOf(key)).toContainEqual(['Version', '1.2.1']);

    expect((await adapt('WEB', VERSION.id, { hidden: false, options: null })).statusCode).toBe(204);
    expect(await valuesOf(key)).not.toContainEqual(['Version', '1.2.1']);
    expect(await offered('WEB')).toContainEqual(['Version', ['1.2', '1.3']]);
    const history = issueActivitiesResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}/activities`)).json(),
    );
    expect(history.rows[0]).toMatchObject({
      type: 'issue.propertyChanged',
      payload: { property: { name: 'Version' }, from: { name: '1.2.1' }, to: null },
    });
  });

  it('has properties of its own, named apart from the instance’s and its others', async () => {
    const sprint = await createProperty('/api/v1/projects/WEB/properties', 'Sprint', ['S1', 'S2']);

    expect((await offered('WEB')).map(([name]) => name)).toContain('Sprint');
    expect((await offered('API')).map(([name]) => name)).not.toContain('Sprint');
    expect((await adaptations('WEB')).own.map(({ name }) => name)).toEqual(['Sprint']);
    for (const [url, name] of [
      ['/api/v1/projects/WEB/properties', 'version'],
      ['/api/v1/projects/WEB/properties', 'sprint'],
      ['/api/v1/properties', 'Sprint'],
    ] as const) {
      const taken = await call('POST', url, {
        type: 'list',
        name,
        shownInList: false,
        askedAtCreation: false,
        required: false,
        options: [{ name: 'A', color: 'gray' }],
      });
      expect(taken.statusCode).toBe(409);
      expect(errorCode(taken)).toBe('PROPERTY_NAME_TAKEN');
    }
    // Another project has its own Sprint.
    await createProperty('/api/v1/projects/API/properties', 'Sprint', ['Q1']);

    const key = await report('WEB', {
      [sprint]:
        (await fieldsOf('WEB')).properties.find(({ id }) => id === sprint)?.options[0]?.id ?? '',
    });
    expect(await valuesOf(key)).toContainEqual(['Sprint', 'S1']);
    expect((await call('DELETE', `/api/v1/projects/API/properties/${sprint}`)).statusCode).toBe(
      404,
    );
    expect((await call('DELETE', `/api/v1/projects/WEB/properties/${sprint}`)).statusCode).toBe(
      204,
    );
    expect(await valuesOf(key)).not.toContainEqual(['Sprint', 'S1']);
  });

  it('hides the priority, or asks for the category without a default', async () => {
    const saved = await call('PUT', '/api/v1/projects/API/fields', {
      category: { hidden: false, required: true },
      priority: { hidden: true, required: false },
    });
    expect(saved.statusCode).toBe(204);
    expect((await fieldsOf('API')).fieldSettings).toStrictEqual({
      category: { hidden: false, required: true },
      priority: { hidden: true, required: false },
    });

    const refused = await call('POST', '/api/v1/projects/API/issues', { title: 'No category' });
    expect(refused.statusCode).toBe(400);
    expect(errorCode(refused)).toBe('CATEGORY_REQUIRED');
    const { categories } = await fieldsOf('API');
    await report('API', {}, { categoryId: categories[0]?.id });
    await report('WEB');

    const both = await call('PUT', '/api/v1/projects/API/fields', {
      category: { hidden: true, required: true },
      priority: { hidden: false, required: false },
    });
    expect(both.statusCode).toBe(400);
  });
});
