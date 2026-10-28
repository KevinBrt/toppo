import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_STATUSES,
} from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  bulkIssuesResponseSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueResponseSchema,
  labelsResponseSchema,
} from '@toppo-tracker/shared';
import { and, eq } from 'drizzle-orm';
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
type Person = 'ada' | 'grace' | 'rita' | 'otto';
/** Ada administers; Grace is on the team; Rita reports; Otto edits only the issues he reported. */
const cookies: Record<Person, string> = { ada: '', grace: '', rita: '', otto: '' };
const ids: Record<Person, string> = { ada: '', grace: '', rita: '', otto: '' };
const LABEL: Record<'mobile' | 'billing', string> = { mobile: '', billing: '' };

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const idOf = <T extends { id: string; kind: string }>(list: readonly T[], kind: T['kind']) =>
  list.find((item) => item.kind === kind)?.id ?? '';
const STATUS = {
  new: idOf(DEFAULT_STATUSES, 'new'),
  inProgress: idOf(DEFAULT_STATUSES, 'inProgress'),
  waiting: idOf(DEFAULT_STATUSES, 'waiting'),
  resolved: idOf(DEFAULT_STATUSES, 'resolved'),
};
const BUG = idOf(DEFAULT_CATEGORIES, 'bug');
const HIGH = idOf(DEFAULT_PRIORITIES, 'high');
const NORMAL = idOf(DEFAULT_PRIORITIES, 'normal');

function call(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  who: Person | null,
  body?: object,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, ...(who ? { cookie: cookies[who] } : {}) },
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

async function report(project = 'WEB', who: Person = 'ada'): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${project}/issues`, who, {
    title: 'Crash on phones',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function reportMany(count: number, project = 'WEB'): Promise<string[]> {
  const keys: string[] = [];
  for (let index = 0; index < count; index += 1) {
    keys.push(await report(project));
  }
  return keys;
}

/** Runs an action on several issues of WEB and answers its outcome, or the refusal. */
function bulk(action: string, body: object, who: Person | null = 'ada', project = 'WEB') {
  return call('POST', `/api/v1/projects/${project}/issues/bulk/${action}`, who, body);
}

function outcome(response: LightMyRequestResponse) {
  expect(response.statusCode).toBe(200);
  return bulkIssuesResponseSchema.parse(response.json());
}

async function issue(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}`, 'ada');
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json());
}

async function history(key: string) {
  const response = await call('GET', `/api/v1/issues/${key}/activities`, 'ada');
  return issueActivitiesResponseSchema.parse(response.json()).rows.map(({ type }) => type);
}

async function moveTo(key: string, statusId: string): Promise<void> {
  expect((await call('PUT', `/api/v1/issues/${key}/status`, 'ada', { statusId })).statusCode).toBe(
    204,
  );
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
  const [ownEditor] = await context.database.db
    .insert(schema.roles)
    .values({ name: 'Own editor', permissions: ['issue.read.own', 'issue.create', 'issue.update'] })
    .returning({ id: schema.roles.id });
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  ids.grace = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  ids.rita = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  ids.otto = await person('Otto Own', 'otto@example.com', ownEditor?.id ?? '');
  for (const [who, email] of [
    ['ada', 'ada@example.com'],
    ['grace', 'grace@example.com'],
    ['rita', 'rita@example.com'],
    ['otto', 'otto@example.com'],
  ] as const) {
    cookies[who] = await signIn(email);
  }
  const me = (await call('GET', '/api/v1/me', 'ada')).json() as { user: { id: string } };
  ids.ada = me.user.id;
  for (const key of ['WEB', 'API', 'OLD']) {
    expect((await call('POST', '/api/v1/projects', 'ada', { key, name: key })).statusCode).toBe(
      201,
    );
    const added = await call('POST', `/api/v1/projects/${key}/members`, 'ada', {
      userIds: [ids.grace, ids.rita, ids.otto],
      roleId: null,
    });
    expect(added.statusCode).toBe(204);
  }
  const saved = await call('PUT', '/api/v1/labels', 'ada', {
    labels: [
      { name: 'Mobile', color: 'blue' },
      { name: 'Billing', color: 'green' },
    ],
    removed: [],
  });
  expect(saved.statusCode).toBe(204);
  const stored = labelsResponseSchema.parse((await call('GET', '/api/v1/labels', 'ada')).json());
  for (const { id, name } of stored.labels) {
    LABEL[name.toLowerCase() as keyof typeof LABEL] = id;
  }
  return () => app.close();
});

describe('moving several issues', () => {
  it('moves those the workflow lets go, and names the others with why', async () => {
    const [stuck = '', going = '', done = ''] = await reportMany(3);
    await moveTo(going, STATUS.inProgress);
    await moveTo(done, STATUS.inProgress);
    await moveTo(done, STATUS.waiting);
    const elsewhere = await report('API');

    const moved = await outcome(
      await bulk('status', {
        issueKeys: [stuck, going, done, 'WEB-999', elsewhere],
        statusId: STATUS.waiting,
      }),
    );

    expect(moved).toStrictEqual({
      changed: [going],
      refused: [
        { key: stuck, code: 'STATUS_NOT_ALLOWED' },
        { key: 'WEB-999', code: 'ISSUE_NOT_FOUND' },
        { key: elsewhere, code: 'ISSUE_NOT_FOUND' },
      ],
    });
    expect((await issue(stuck)).status.id).toBe(STATUS.new);
    expect((await issue(going)).status.id).toBe(STATUS.waiting);
    expect(await history(going)).toStrictEqual([
      'issue.statusChanged',
      'issue.statusChanged',
      'issue.created',
    ]);
  });

  it('closes the issues a done status takes, keeping when each was first closed', async () => {
    const [open = '', closed = ''] = await reportMany(2);
    await moveTo(closed, STATUS.resolved);
    const closedAt = (await issue(closed)).closedAt;

    const moved = await outcome(
      await bulk('status', { issueKeys: [open, closed], statusId: STATUS.resolved }),
    );

    expect(moved).toStrictEqual({ changed: [open], refused: [] });
    expect((await issue(open)).closedAt).not.toBeNull();
    expect((await issue(closed)).closedAt).toBe(closedAt);
  });
});

describe('changing the fields of several issues', () => {
  it('gives a category and a priority, one activity for each real change', async () => {
    const [plain = '', urgent = ''] = await reportMany(2);
    expect(
      (await call('PATCH' as 'PUT', `/api/v1/issues/${urgent}`, 'ada', { priorityId: HIGH }))
        .statusCode,
    ).toBe(204);

    const changed = await outcome(
      await bulk('fields', { issueKeys: [plain, urgent], categoryId: BUG, priorityId: HIGH }),
    );

    expect(changed).toStrictEqual({ changed: [plain, urgent], refused: [] });
    expect(await issue(plain)).toMatchObject({ category: { id: BUG }, priority: { id: HIGH } });
    expect(await history(plain)).toStrictEqual([
      'issue.categoryChanged',
      'issue.priorityChanged',
      'issue.created',
    ]);
    expect((await history(urgent)).filter((type) => type === 'issue.priorityChanged')).toHaveLength(
      1,
    );
    expect(
      await outcome(await bulk('fields', { issueKeys: [plain], priorityId: HIGH })),
    ).toStrictEqual({ changed: [], refused: [] });
  });

  it('refuses a value that does not exist, and changes nothing', async () => {
    const key = await report();
    const unknown = await bulk('fields', {
      issueKeys: [key],
      categoryId: '01a1569b-9900-7000-8000-000000000999',
      priorityId: HIGH,
    });

    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('INVALID_CATEGORY');
    expect((await issue(key)).priority.id).toBe(NORMAL);
    expect((await bulk('fields', { issueKeys: [key] })).statusCode).toBe(400);
  });
});

describe('assigning several issues', () => {
  it('gives them to someone, then to nobody, each recorded and told', async () => {
    const [first = '', second = ''] = await reportMany(2);
    const toldOf = async () =>
      (
        await context.database.db
          .select({ id: schema.jobs.id })
          .from(schema.jobs)
          .where(eq(schema.jobs.type, 'activity.recorded'))
      ).length;
    const before = await toldOf();

    expect(
      await outcome(await bulk('assignee', { issueKeys: [first, second], assigneeId: ids.grace })),
    ).toStrictEqual({ changed: [first, second], refused: [] });
    expect((await issue(second)).assignee?.name).toBe('Grace Hopper');
    expect(await history(first)).toContain('issue.assigneeChanged');
    expect(await toldOf()).toBe(before + 2);

    expect(
      await outcome(await bulk('assignee', { issueKeys: [first, second], assigneeId: null })),
    ).toStrictEqual({ changed: [first, second], refused: [] });
    expect((await issue(first)).assignee).toBeNull();
  });

  it('only to someone who reaches the project', async () => {
    const key = await report();
    const stranger = await bulk('assignee', {
      issueKeys: [key],
      assigneeId: '01a1569b-9900-7000-8000-000000000999',
    });

    expect(stranger.statusCode).toBe(400);
    expect(errorCode(stranger)).toBe('INVALID_ASSIGNEE');
  });
});

describe('labelling several issues', () => {
  it('adds labels and takes others off, each issue changed once', async () => {
    const [tagged = '', bare = ''] = await reportMany(2);
    expect(
      (await call('PUT', `/api/v1/issues/${tagged}/labels`, 'ada', { labelIds: [LABEL.mobile] }))
        .statusCode,
    ).toBe(204);

    const labelled = await outcome(
      await bulk('labels', {
        issueKeys: [tagged, bare],
        add: [LABEL.billing],
        remove: [LABEL.mobile],
      }),
    );

    expect(labelled).toStrictEqual({ changed: [tagged, bare], refused: [] });
    expect((await issue(tagged)).labels.map(({ name }) => name)).toStrictEqual(['Billing']);
    expect((await issue(bare)).labels.map(({ name }) => name)).toStrictEqual(['Billing']);
    expect(
      await outcome(
        await bulk('labels', { issueKeys: [tagged, bare], add: [LABEL.billing], remove: [] }),
      ),
    ).toStrictEqual({ changed: [], refused: [] });
    expect((await history(tagged)).filter((type) => type === 'issue.labelsChanged')).toHaveLength(
      2,
    );
  });

  it('refuses a label that does not exist, one given twice, or nothing to do', async () => {
    const key = await report();
    const unknown = await bulk('labels', {
      issueKeys: [key],
      add: ['01a1569b-9900-7000-8000-000000000999'],
      remove: [],
    });

    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('INVALID_LABEL');
    expect(
      (await bulk('labels', { issueKeys: [key], add: [LABEL.mobile], remove: [LABEL.mobile] }))
        .statusCode,
    ).toBe(400);
    expect((await bulk('labels', { issueKeys: [key], add: [], remove: [] })).statusCode).toBe(400);
    expect((await issue(key)).labels).toStrictEqual([]);
  });
});

describe('deleting several issues', () => {
  it('deletes them for good, each deletion recorded and told to nobody', async () => {
    const keys = await reportMany(2);

    expect(await outcome(await bulk('delete', { issueKeys: keys }))).toStrictEqual({
      changed: keys,
      refused: [],
    });
    for (const key of keys) {
      expect((await call('GET', `/api/v1/issues/${key}`, 'ada')).statusCode).toBe(404);
    }
    const deleted = await context.database.db
      .select({ payload: schema.activities.payload })
      .from(schema.activities)
      .where(eq(schema.activities.type, 'issue.deleted'));
    expect(deleted.map(({ payload }) => payload)).toStrictEqual(
      expect.arrayContaining(keys.map((key) => ({ key }))),
    );
    expect(await outcome(await bulk('delete', { issueKeys: keys }))).toStrictEqual({
      changed: [],
      refused: keys.map((key) => ({ key, code: 'ISSUE_NOT_FOUND' })),
    });
  });
});

describe('an action on several issues', () => {
  it('takes only the issues one sees', async () => {
    const own = await report('WEB', 'otto');
    const others = await report();

    expect(
      await outcome(
        await bulk('status', { issueKeys: [own, others], statusId: STATUS.inProgress }, 'otto'),
      ),
    ).toStrictEqual({ changed: [own], refused: [{ key: others, code: 'ISSUE_NOT_FOUND' }] });
    expect((await issue(others)).status.id).toBe(STATUS.new);
  });

  it('needs the permission of its action', async () => {
    const key = await report();
    const refusals = [
      await bulk('status', { issueKeys: [key], statusId: STATUS.inProgress }, 'rita'),
      await bulk('fields', { issueKeys: [key], priorityId: HIGH }, 'rita'),
      await bulk('assignee', { issueKeys: [key], assigneeId: null }, 'otto'),
      await bulk('labels', { issueKeys: [key], add: [LABEL.mobile], remove: [] }, 'rita'),
      await bulk('delete', { issueKeys: [key] }, 'grace'),
    ];

    expect(refusals.map(({ statusCode }) => statusCode)).toStrictEqual([403, 403, 403, 403, 403]);
    expect((await issue(key)).status.id).toBe(STATUS.new);
  });

  it('answers 401 signed out, 404 for a project out of reach, 409 once archived', async () => {
    const key = await report();
    const old = await report('OLD');
    expect((await call('POST', '/api/v1/projects/OLD/archive', 'ada')).statusCode).toBe(204);

    expect((await bulk('delete', { issueKeys: [key] }, null)).statusCode).toBe(401);
    expect((await bulk('delete', { issueKeys: [key] }, 'ada', 'NOPE')).statusCode).toBe(404);
    const archived = await bulk('delete', { issueKeys: [old] }, 'ada', 'OLD');
    expect(archived.statusCode).toBe(409);
    expect(errorCode(archived)).toBe('PROJECT_ARCHIVED');
  });

  it('takes from one to 100 issues, each once', async () => {
    const key = await report();
    const many = Array.from({ length: 101 }, (_, index) => `WEB-${index + 1}`);

    expect((await bulk('delete', { issueKeys: [] })).statusCode).toBe(400);
    expect((await bulk('delete', { issueKeys: many })).statusCode).toBe(400);
    expect((await bulk('delete', { issueKeys: [key, key] })).statusCode).toBe(400);
    expect((await bulk('delete', { issueKeys: ['web 1'] })).statusCode).toBe(400);
    expect(
      await context.database.db
        .select({ id: schema.issues.id })
        .from(schema.issues)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.issues.projectId))
        .where(and(eq(schema.projects.key, 'WEB'), eq(schema.issues.number, Number(key.slice(4))))),
    ).toHaveLength(1);
  });
});
