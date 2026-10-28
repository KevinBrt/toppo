import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  type ProjectWorkflowResponse,
  projectWorkflowResponseSchema,
  type WorkflowRequest,
  workflowResponseSchema,
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
/** Team: works on WEB's issues, never on its settings. */
let teamCookie: string;
/** Team too, but kept out of WEB. */
let outsiderCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function idOf(kind: string): string {
  const found = DEFAULT_STATUSES.find((status) => status.kind === kind);
  if (!found) {
    throw new Error(`No default ${kind}`);
  }
  return found.id;
}

const NEW = idOf('new');
const TO_DO = idOf('toDo');

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

async function workflowOf(projectKey: string): Promise<ProjectWorkflowResponse> {
  const response = await call('GET', `/api/v1/projects/${projectKey}/workflow`, adminCookie);
  expect(response.statusCode).toBe(200);
  return projectWorkflowResponseSchema.parse(response.json());
}

/** The project's workflow as stored, ready to send back once `change` has edited it. */
async function asRequest(
  projectKey: string,
  change: (request: WorkflowRequest) => WorkflowRequest = (request) => request,
): Promise<WorkflowRequest> {
  const { mode, statuses, transitions } = await workflowOf(projectKey);
  return change({
    mode,
    statuses: statuses.map(({ id, name, color, closes, isInitial }) => ({
      ref: id,
      name,
      color,
      closes,
      isInitial,
    })),
    transitions,
    removed: [],
  });
}

const save = (projectKey: string, request: WorkflowRequest) =>
  call('PUT', `/api/v1/projects/${projectKey}/workflow`, adminCookie, request);

async function statusesOffered(projectKey: string): Promise<string[]> {
  const response = await call('GET', `/api/v1/projects/${projectKey}/issue-fields`, adminCookie);
  return issueFieldsResponseSchema.parse(response.json()).statuses.map(({ name }) => name);
}

async function issue(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json());
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
  const person = (name: string, email: string) =>
    createTestUser(context.database, {
      name,
      email,
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    });
  const teamId = await person('Grace Hopper', 'grace@example.com');
  await person('Alan Turing', 'alan@example.com');
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  outsiderCookie = await signIn('alan@example.com');
  for (const key of ['WEB', 'API', 'OLD']) {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key, name: key })).statusCode,
    ).toBe(201);
  }
  const added = await call('POST', '/api/v1/projects/WEB/members', adminCookie, {
    userIds: [teamId],
    roleId: null,
  });
  expect(added.statusCode).toBe(204);
  const reported = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
    title: 'Broken link',
  });
  expect(createIssueResponseSchema.parse(reported.json()).key).toBe('WEB-1');
  expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);
  return () => app.close();
});

describe('a project’s workflow', () => {
  it('is the instance’s while the project follows it, with the project’s issues on each status', async () => {
    const workflow = await workflowOf('WEB');

    expect(workflow.customized).toBe(false);
    expect(workflow.statuses.map(({ id }) => id)).toStrictEqual(
      DEFAULT_STATUSES.map(({ id }) => id),
    );
    expect(workflow.statuses.every(({ shared }) => shared)).toBe(true);
    expect(workflow.statuses[0]).toMatchObject({ id: NEW, isInitial: true, issueCount: 1 });
    expect(workflow.organization.map(({ id }) => id)).toStrictEqual(
      DEFAULT_STATUSES.map(({ id }) => id),
    );
  });

  it('is for those who manage the project’s settings', async () => {
    const anonymous = await call('GET', '/api/v1/projects/WEB/workflow', '');
    const member = await call('GET', '/api/v1/projects/WEB/workflow', teamCookie);
    const outsider = await call('GET', '/api/v1/projects/WEB/workflow', outsiderCookie);

    expect(anonymous.statusCode).toBe(401);
    expect(member.statusCode).toBe(403);
    expect(outsider.statusCode).toBe(404);
  });

  it('is neither saved nor given back while the project follows the instance’s', async () => {
    const saved = await save('WEB', await asRequest('WEB'));
    const reverted = await call('POST', '/api/v1/projects/WEB/workflow/revert', adminCookie, {
      moves: [],
    });

    expect(saved.statusCode).toBe(409);
    expect(errorCode(saved)).toBe('NOT_CUSTOMIZED');
    expect(reverted.statusCode).toBe(409);
    expect(errorCode(reverted)).toBe('NOT_CUSTOMIZED');
  });
});

describe('customizing a project’s workflow', () => {
  it('copies the instance’s, no issue moving, once', async () => {
    const response = await call('POST', '/api/v1/projects/WEB/workflow/customize', adminCookie);
    const again = await call('POST', '/api/v1/projects/WEB/workflow/customize', adminCookie);
    const archived = await call('POST', '/api/v1/projects/OLD/workflow/customize', adminCookie);

    expect(response.statusCode).toBe(204);
    const workflow = await workflowOf('WEB');
    expect(workflow.customized).toBe(true);
    expect(workflow.statuses.map(({ id }) => id)).toStrictEqual(
      DEFAULT_STATUSES.map(({ id }) => id),
    );
    expect((await issue('WEB-1')).status.id).toBe(NEW);
    expect(again.statusCode).toBe(409);
    expect(errorCode(again)).toBe('ALREADY_CUSTOMIZED');
    expect(archived.statusCode).toBe(409);
    expect(errorCode(archived)).toBe('PROJECT_ARCHIVED');
  });

  it('saves the copy for the project only, a status of its own added and connected', async () => {
    const response = await save(
      'WEB',
      await asRequest('WEB', (request) => ({
        ...request,
        statuses: [
          ...request.statuses,
          {
            ref: 'new-1',
            name: 'Review',
            color: 'pink',
            closes: false,
            isInitial: false,
          },
        ],
        transitions: [...request.transitions, { from: NEW, to: 'new-1' }],
      })),
    );

    expect(response.statusCode).toBe(204);
    const review = (await workflowOf('WEB')).statuses.find(({ name }) => name === 'Review');
    expect(review).toMatchObject({ shared: false, issueCount: 0 });
    expect(await statusesOffered('WEB')).toContain('Review');
    expect(await statusesOffered('API')).not.toContain('Review');
    const instance = await call('GET', '/api/v1/workflow', adminCookie);
    expect(
      workflowResponseSchema.parse(instance.json()).statuses.map(({ name }) => name),
    ).not.toContain('Review');
    const moved = await call('PUT', '/api/v1/issues/WEB-1/status', adminCookie, {
      statusId: review?.id,
    });
    expect(moved.statusCode).toBe(204);
  });

  it('keeps the instance’s statuses as the settings make them, sharing their changes', async () => {
    const renamed = await save(
      'WEB',
      await asRequest('WEB', (request) => ({
        ...request,
        statuses: request.statuses.map((status) =>
          status.ref === TO_DO ? { ...status, name: 'Ready' } : status,
        ),
      })),
    );
    expect(renamed.statusCode).toBe(409);
    expect(errorCode(renamed)).toBe('STATUS_SHARED');

    const instance = workflowResponseSchema.parse(
      (await call('GET', '/api/v1/workflow', adminCookie)).json(),
    );
    const settings = await call('PUT', '/api/v1/workflow', adminCookie, {
      mode: instance.mode,
      statuses: instance.statuses.map(({ id, name, color, closes, isInitial }) => ({
        ref: id,
        name: id === TO_DO ? 'Ready' : name,
        color,
        closes,
        isInitial,
      })),
      transitions: instance.transitions,
      removed: [],
    });
    expect(settings.statusCode).toBe(204);
    expect(await statusesOffered('WEB')).toContain('Ready');
  });
});

describe('going back to the instance’s workflow', () => {
  it('asks where the issues on the project’s own statuses go', async () => {
    const response = await call('POST', '/api/v1/projects/WEB/workflow/revert', adminCookie, {
      moves: [],
    });

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('MOVE_REQUIRED');
    expect((await workflowOf('WEB')).customized).toBe(true);
  });

  it('moves them as chosen, one activity each, and drops the copy with its own statuses', async () => {
    const review = (await workflowOf('WEB')).statuses.find(({ name }) => name === 'Review');
    const response = await call('POST', '/api/v1/projects/WEB/workflow/revert', adminCookie, {
      moves: [{ statusId: review?.id, moveTo: TO_DO }],
    });

    expect(response.statusCode).toBe(204);
    expect((await workflowOf('WEB')).customized).toBe(false);
    expect((await issue('WEB-1')).status.id).toBe(TO_DO);
    const history = await call('GET', '/api/v1/issues/WEB-1/activities', adminCookie);
    expect(issueActivitiesResponseSchema.parse(history.json()).rows[0]).toMatchObject({
      type: 'issue.statusChanged',
      payload: { from: { name: 'Review' }, to: { id: TO_DO, name: 'Ready' } },
    });
    const left = await context.database.db
      .select({ id: schema.statuses.id })
      .from(schema.statuses)
      .where(eq(schema.statuses.id, review?.id ?? ''));
    expect(left).toStrictEqual([]);
    expect(await statusesOffered('WEB')).not.toContain('Review');
  });
});
