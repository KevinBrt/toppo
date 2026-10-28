import { DEFAULT_ROLE_IDS, DEFAULT_STATUSES, DEFAULT_TRANSITIONS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  type WorkflowRequest,
  type WorkflowResponse,
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
/** Team: works on issues, never on the settings. */
let teamCookie: string;

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
const IN_PROGRESS = idOf('inProgress');
const WAITING = idOf('waiting');
const RESOLVED = idOf('resolved');

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

async function workflow(): Promise<WorkflowResponse> {
  const response = await call('GET', '/api/v1/workflow', adminCookie);
  expect(response.statusCode).toBe(200);
  return workflowResponseSchema.parse(response.json());
}

/** The workflow as stored, ready to send back once `change` has edited it. */
async function asRequest(
  change: (request: WorkflowRequest) => WorkflowRequest = (request) => request,
): Promise<WorkflowRequest> {
  const { mode, statuses, transitions } = await workflow();
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

const save = (request: WorkflowRequest) => call('PUT', '/api/v1/workflow', adminCookie, request);

async function report(): Promise<string> {
  const response = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
    title: 'Broken link',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function issue(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, adminCookie);
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json());
}

const move = (key: string, statusId: string) =>
  call('PUT', `/api/v1/issues/${key}/status`, adminCookie, { statusId });

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

describe('workflow routes', () => {
  it.each(['GET', 'PUT'] as const)(
    '%s needs a session, then the settings permission',
    async (method) => {
      const anonymous = await call(method, '/api/v1/workflow', '', {});
      const member = await call(method, '/api/v1/workflow', teamCookie, {});

      expect(anonymous.statusCode).toBe(401);
      expect(member.statusCode).toBe(403);
      expect(errorCode(member)).toBe('FORBIDDEN');
    },
  );

  it('lists the statuses in order, the issues on each, and the moves between them', async () => {
    expect(await report()).toBe('WEB-1');

    const { mode, statuses, transitions } = await workflow();

    expect(mode).toBe('defined');
    expect(
      statuses.map(({ id, isInitial, issueCount }) => [id, isInitial, issueCount]),
    ).toStrictEqual([
      [NEW, true, 1],
      [TO_DO, false, 0],
      [IN_PROGRESS, false, 0],
      [WAITING, false, 0],
      [RESOLVED, false, 0],
    ]);
    expect(transitions).toHaveLength(DEFAULT_TRANSITIONS.length);
  });
});

describe('saving the workflow', () => {
  it('renames, reorders, adds and connects a status, and chooses where issues start', async () => {
    const response = await save(
      await asRequest((request) => ({
        ...request,
        statuses: [
          { ref: 'new-1', name: 'Triage', color: 'pink', closes: false, isInitial: true },
          ...request.statuses.map((status) =>
            status.ref === WAITING
              ? { ...status, name: 'Waiting for customer', isInitial: false }
              : { ...status, isInitial: false },
          ),
        ],
        transitions: [...request.transitions, { from: 'new-1', to: NEW }],
      })),
    );

    expect(response.statusCode).toBe(204);
    const { statuses } = await workflow();
    expect(statuses.map(({ name }) => name)).toStrictEqual([
      'Triage',
      'New',
      'To do',
      'In progress',
      'Waiting for customer',
      'Resolved',
    ]);
    const triage = statuses[0]?.id ?? '';
    expect(await report()).toBe('WEB-2');
    expect((await issue('WEB-2')).status.id).toBe(triage);
    const fields = await call('GET', '/api/v1/projects/WEB/issue-fields', adminCookie);
    const first = issueFieldsResponseSchema.parse(fields.json()).statuses[0];
    expect(first).toMatchObject({ name: 'Triage', isInitial: true, next: [NEW] });
  });

  it('lets two statuses swap their names', async () => {
    const response = await save(
      await asRequest((request) => ({
        ...request,
        statuses: request.statuses.map((status) => {
          if (status.ref === TO_DO) {
            return { ...status, name: 'In progress' };
          }
          return status.ref === IN_PROGRESS ? { ...status, name: 'To do' } : status;
        }),
      })),
    );

    expect(response.statusCode).toBe(204);
    const names = (await workflow()).statuses.map(({ name }) => name);
    expect(names.slice(2, 4)).toStrictEqual(['In progress', 'To do']);
  });

  it('closes and reopens issues as their status starts or stops closing them', async () => {
    expect((await move('WEB-1', WAITING)).statusCode).toBe(409);
    expect((await move('WEB-1', IN_PROGRESS)).statusCode).toBe(204);
    const closing = await save(
      await asRequest((request) => ({
        ...request,
        statuses: request.statuses.map((status) =>
          status.ref === IN_PROGRESS ? { ...status, closes: true } : status,
        ),
      })),
    );
    expect(closing.statusCode).toBe(204);
    expect((await issue('WEB-1')).closedAt).not.toBeNull();

    const reopening = await save(
      await asRequest((request) => ({
        ...request,
        statuses: request.statuses.map((status) =>
          status.ref === IN_PROGRESS ? { ...status, closes: false } : status,
        ),
      })),
    );
    expect(reopening.statusCode).toBe(204);
    expect((await issue('WEB-1')).closedAt).toBeNull();
  });

  it('moves the issues of a status taken out to the one chosen, one activity each', async () => {
    const response = await save(
      await asRequest((request) => ({
        ...request,
        statuses: request.statuses.filter(({ ref }) => ref !== IN_PROGRESS),
        transitions: request.transitions.filter(
          ({ from, to }) => from !== IN_PROGRESS && to !== IN_PROGRESS,
        ),
        removed: [{ statusId: IN_PROGRESS, moveTo: RESOLVED }],
      })),
    );

    expect(response.statusCode).toBe(204);
    const moved = await issue('WEB-1');
    expect(moved.status.id).toBe(RESOLVED);
    expect(moved.closedAt).not.toBeNull();
    const history = await call('GET', '/api/v1/issues/WEB-1/activities', adminCookie);
    expect(issueActivitiesResponseSchema.parse(history.json()).rows[0]).toMatchObject({
      type: 'issue.statusChanged',
      actor: { name: 'Ada Lovelace' },
      payload: { from: { id: IN_PROGRESS, name: 'To do' }, to: { id: RESOLVED, name: 'Resolved' } },
    });
    // No workflow uses it any more and no issue has it: it is gone from the catalog.
    const left = await context.database.db
      .select({ id: schema.statuses.id })
      .from(schema.statuses)
      .where(eq(schema.statuses.id, IN_PROGRESS));
    expect(left).toStrictEqual([]);
  });

  it('lets issues go anywhere in free mode, keeping the moves for when it is defined again', async () => {
    const defined = await workflow();
    expect(
      (await save(await asRequest((request) => ({ ...request, mode: 'free' })))).statusCode,
    ).toBe(204);
    // Resolved only leads back to To do in the defined workflow.
    expect((await move('WEB-1', WAITING)).statusCode).toBe(204);
    const fields = await call('GET', '/api/v1/projects/WEB/issue-fields', adminCookie);
    const waiting = issueFieldsResponseSchema
      .parse(fields.json())
      .statuses.find(({ id }) => id === WAITING);
    expect(waiting?.next).toHaveLength(defined.statuses.length - 1);

    expect(
      (await save(await asRequest((request) => ({ ...request, mode: 'defined' })))).statusCode,
    ).toBe(204);
    expect((await workflow()).transitions).toStrictEqual(defined.transitions);
  });

  it('refuses a status taken out meanwhile, one added meanwhile, a name twice, two initial ones', async () => {
    const current = await asRequest();
    const takenOut = await save({
      ...current,
      statuses: [
        ...current.statuses,
        { ref: IN_PROGRESS, name: 'Back', color: 'gray', closes: false, isInitial: false },
      ],
    });
    // Made before Waiting existed: it neither keeps nor takes it out.
    const stale = await save({
      ...current,
      statuses: current.statuses.filter(({ ref }) => ref !== WAITING),
      transitions: current.transitions.filter(({ from, to }) => from !== WAITING && to !== WAITING),
    });
    const twice = await save({
      ...current,
      statuses: [
        ...current.statuses,
        { ref: 'new-1', name: 'resolved', color: 'gray', closes: true, isInitial: false },
      ],
    });
    const initials = await save({
      ...current,
      statuses: current.statuses.map((status) => ({ ...status, isInitial: true })),
    });

    expect(takenOut.statusCode).toBe(409);
    expect(errorCode(takenOut)).toBe('WORKFLOW_CHANGED');
    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('WORKFLOW_CHANGED');
    expect(twice.statusCode).toBe(400);
    expect(initials.statusCode).toBe(400);
  });
});
