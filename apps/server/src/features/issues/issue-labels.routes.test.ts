import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import {
  apiErrorSchema,
  assignedIssuesResponseSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
  labelsResponseSchema,
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
let adminId: string;
const LABEL: Record<'mobile' | 'billing' | 'security', string> = {
  mobile: '',
  billing: '',
  security: '',
};

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

async function report(project: string, cookie = adminCookie): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${project}/issues`, cookie, {
    title: 'Crash on phones',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

const label = (key: string, labelIds: string[], cookie = adminCookie) =>
  call('PUT', `/api/v1/issues/${key}/labels`, cookie, { labelIds });

async function labelsOf(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  return issueResponseSchema.parse(response.json()).labels.map(({ name }) => name);
}

async function history(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}/activities`, adminCookie);
  return issueActivitiesResponseSchema.parse(response.json()).rows;
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
  for (const key of ['WEB', 'OLD']) {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key, name: key })).statusCode,
    ).toBe(201);
    expect(
      (
        await call('POST', `/api/v1/projects/${key}/members`, adminCookie, {
          userIds: [requester],
          roleId: null,
        })
      ).statusCode,
    ).toBe(204);
  }
  const saved = await call('PUT', '/api/v1/labels', adminCookie, {
    labels: [
      { name: 'Mobile', color: 'blue' },
      { name: 'billing', color: 'green' },
      { name: 'Security', color: 'pink' },
    ],
    removed: [],
  });
  expect(saved.statusCode).toBe(204);
  const stored = labelsResponseSchema.parse(
    (await call('GET', '/api/v1/labels', adminCookie)).json(),
  ).labels;
  for (const { id, name } of stored) {
    LABEL[name.toLowerCase() as keyof typeof LABEL] = id;
  }
  const me = (await call('GET', '/api/v1/me', adminCookie)).json() as { user: { id: string } };
  adminId = me.user.id;
  return () => app.close();
});

describe('the labels of an issue', () => {
  it('are given exactly as asked, shown by name, each change told once', async () => {
    const key = await report('WEB');
    expect((await label(key, [LABEL.security, LABEL.mobile])).statusCode).toBe(204);
    expect(await labelsOf(key)).toStrictEqual(['Mobile', 'Security']);

    expect((await label(key, [LABEL.billing, LABEL.security])).statusCode).toBe(204);
    expect((await label(key, [LABEL.security, LABEL.billing])).statusCode).toBe(204);

    expect(await labelsOf(key)).toStrictEqual(['billing', 'Security']);
    const told = (await history(key)).filter(({ type }) => type === 'issue.labelsChanged');
    expect(told.map(({ payload }) => payload)).toStrictEqual([
      {
        added: [{ id: LABEL.billing, name: 'billing' }],
        removed: [{ id: LABEL.mobile, name: 'Mobile' }],
      },
      {
        added: [
          { id: LABEL.security, name: 'Security' },
          { id: LABEL.mobile, name: 'Mobile' },
        ],
        removed: [],
      },
    ]);
  });

  it('are only labels of the instance, each once', async () => {
    const key = await report('WEB');
    const unknown = await label(key, ['01a1569b-9900-7000-8000-000000000999']);
    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('INVALID_LABEL');
    expect((await label(key, [LABEL.mobile, LABEL.mobile])).statusCode).toBe(400);
    expect(await labelsOf(key)).toStrictEqual([]);
  });

  it('are changed by whoever edits the issue, never on an archived project', async () => {
    const own = await report('WEB', requesterCookie);
    const refused = await label(own, [LABEL.mobile], requesterCookie);
    expect(refused.statusCode).toBe(403);

    const old = await report('OLD');
    expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);
    const archived = await label(old, [LABEL.mobile]);
    expect(archived.statusCode).toBe(409);
    expect(errorCode(archived)).toBe('PROJECT_ARCHIVED');
  });

  it('show in the lists, filter them, and are offered by the forms', async () => {
    const tagged = await report('WEB');
    const other = await report('WEB');
    await label(tagged, [LABEL.billing]);
    await label(other, [LABEL.security]);
    expect(
      (await call('PUT', `/api/v1/issues/${tagged}/assignee`, adminCookie, { assigneeId: adminId }))
        .statusCode,
    ).toBe(204);

    const filtered = issuesResponseSchema.parse(
      (
        await call(
          'GET',
          `/api/v1/projects/WEB/issues?label=${LABEL.billing},${LABEL.mobile}`,
          adminCookie,
        )
      ).json(),
    );
    expect(filtered.rows.map(({ key }) => key)).toContain(tagged);
    expect(filtered.rows.map(({ key }) => key)).not.toContain(other);
    expect(filtered.rows.find(({ key }) => key === tagged)?.labels).toStrictEqual([
      { id: LABEL.billing, name: 'billing', color: 'green' },
    ]);
    const mine = assignedIssuesResponseSchema.parse(
      (await call('GET', '/api/v1/issues/assigned', adminCookie)).json(),
    );
    expect(
      mine.rows.find(({ key }) => key === tagged)?.labels.map(({ name }) => name),
    ).toStrictEqual(['billing']);
    const fields = issueFieldsResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/issue-fields', adminCookie)).json(),
    );
    expect(fields.labels.map(({ name }) => name)).toStrictEqual(['billing', 'Mobile', 'Security']);
  });
});
