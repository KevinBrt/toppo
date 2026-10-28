import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_STATUSES,
} from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  createIssueResponseSchema,
  type IssuesResponse,
  issuesResponseSchema,
  projectWorkflowResponseSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
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
/** Requester: sees their own issues only. */
let requesterCookie: string;
let outsiderCookie: string;
let adminId: string;
let teamId: string;
let requesterId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function idOf<T extends { kind: string; id: string }>(list: readonly T[], kind: string): string {
  const found = list.find((item) => item.kind === kind);
  if (!found) {
    throw new Error(`No default ${kind}`);
  }
  return found.id;
}

const STATUS = {
  new: idOf(DEFAULT_STATUSES, 'new'),
  toDo: idOf(DEFAULT_STATUSES, 'toDo'),
  inProgress: idOf(DEFAULT_STATUSES, 'inProgress'),
  resolved: idOf(DEFAULT_STATUSES, 'resolved'),
};
const PRIORITY = {
  low: idOf(DEFAULT_PRIORITIES, 'low'),
  normal: idOf(DEFAULT_PRIORITIES, 'normal'),
  high: idOf(DEFAULT_PRIORITIES, 'high'),
  urgent: idOf(DEFAULT_PRIORITIES, 'urgent'),
};
const BUG = idOf(DEFAULT_CATEGORIES, 'bug');
const QUESTION = idOf(DEFAULT_CATEGORIES, 'question');

function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT',
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

async function report(cookie: string, body: object): Promise<string> {
  const response = await call('POST', '/api/v1/projects/WEB/issues', cookie, body);
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function move(key: string, statusId: string): Promise<void> {
  const response = await call('PUT', `/api/v1/issues/${key}/status`, adminCookie, { statusId });
  expect(response.statusCode).toBe(204);
}

async function list(query: string, cookie = adminCookie): Promise<IssuesResponse> {
  const response = await call('GET', `/api/v1/projects/WEB/issues?${query}`, cookie);
  expect(response.statusCode).toBe(200);
  return issuesResponseSchema.parse(response.json());
}

/** The numbers of the issues listed, in order: `[5, 3]` for WEB-5 then WEB-3. */
async function numbers(query: string, cookie = adminCookie): Promise<number[]> {
  return (await list(query, cookie)).rows.map(({ key }) => Number(key.replace('WEB-', '')));
}

/**
 * Five issues, each set apart by something:
 *
 * | Issue | Reporter  | Category | Priority | Assignee | Status      |
 * | ----- | --------- | -------- | -------- | -------- | ----------- |
 * | WEB-1 | admin     | bug      | high     | team     | In progress |
 * | WEB-2 | admin     | request  | normal   | no one   | Resolved    |
 * | WEB-3 | requester | request  | normal   | no one   | New         |
 * | WEB-4 | admin     | question | urgent   | admin    | To do       |
 * | WEB-5 | team      | bug      | low      | team     | New         |
 *
 * WEB-3 changed last, then WEB-4, WEB-2 and WEB-1 as they moved.
 */
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
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  teamId = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  requesterId = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  await person('Alan Turing', 'alan@example.com', DEFAULT_ROLE_IDS.team);
  const [admin] = await context.database.db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'ada@example.com'));
  adminId = admin?.id ?? '';
  adminCookie = await signIn('ada@example.com');
  const teamCookie = await signIn('grace@example.com');
  requesterCookie = await signIn('rita@example.com');
  outsiderCookie = await signIn('alan@example.com');

  expect(
    (await call('POST', '/api/v1/projects', adminCookie, { key: 'WEB', name: 'Web' })).statusCode,
  ).toBe(201);
  const added = await call('POST', '/api/v1/projects/WEB/members', adminCookie, {
    userIds: [teamId, requesterId],
    roleId: null,
  });
  expect(added.statusCode).toBe(204);

  await report(adminCookie, {
    title: 'Broken link',
    categoryId: BUG,
    priorityId: PRIORITY.high,
    assigneeId: teamId,
  });
  await report(adminCookie, {
    title: 'Slow page',
    description: 'The **dashboard** takes ten seconds to load at the Café.',
  });
  await report(requesterCookie, { title: 'Typo on the home page' });
  await report(adminCookie, {
    title: 'Crash on save',
    categoryId: QUESTION,
    priorityId: PRIORITY.urgent,
    assigneeId: adminId,
  });
  await report(teamCookie, {
    title: 'Sign-in fails',
    categoryId: BUG,
    priorityId: PRIORITY.low,
    assigneeId: teamId,
  });
  await move('WEB-1', STATUS.inProgress);
  await move('WEB-2', STATUS.resolved);
  await move('WEB-4', STATUS.toDo);
  const edited = await call('PATCH', '/api/v1/issues/WEB-3', adminCookie, {
    title: 'Typo on home',
  });
  expect(edited.statusCode).toBe(204);
  return () => app.close();
});

describe('listing a project’s issues', () => {
  it('lists every issue, newest first and ungrouped, by default', async () => {
    const page = await list('');

    expect(page.rows.map(({ key }) => key)).toStrictEqual([
      'WEB-5',
      'WEB-4',
      'WEB-3',
      'WEB-2',
      'WEB-1',
    ]);
    expect(page).toMatchObject({ matching: 5, page: 1, groups: null });
  });

  it('pages, counting every matching issue', async () => {
    const second = await list('page=2&group=status');

    expect(second.rows).toStrictEqual([]);
    expect(second.matching).toBe(5);
    expect(second.groups?.reduce((sum, group) => sum + group.count, 0)).toBe(5);
  });
});

describe('filtering', () => {
  it('keeps the open issues, or the closed ones', async () => {
    expect(await numbers('state=open')).toStrictEqual([5, 4, 3, 1]);
    expect(await numbers('state=closed')).toStrictEqual([2]);
  });

  it('keeps the issues in any of the statuses, priorities or categories given', async () => {
    expect(await numbers(`status=${STATUS.new}`)).toStrictEqual([5, 3]);
    expect(await numbers(`status=${STATUS.new},${STATUS.toDo}`)).toStrictEqual([5, 4, 3]);
    expect(await numbers(`priority=${PRIORITY.high},${PRIORITY.urgent}`)).toStrictEqual([4, 1]);
    expect(await numbers(`category=${BUG}`)).toStrictEqual([5, 1]);
  });

  it('keeps the issues assigned to someone, to the caller, or to no one', async () => {
    expect(await numbers(`assignee=${teamId}`)).toStrictEqual([5, 1]);
    expect(await numbers('assignee=me')).toStrictEqual([4]);
    expect(await numbers('assignee=none')).toStrictEqual([3, 2]);
    expect(await numbers(`assignee=none,${adminId}`)).toStrictEqual([4, 3, 2]);
  });

  it('keeps the issues reported by someone, or by the caller', async () => {
    expect(await numbers(`reporter=${requesterId}`)).toStrictEqual([3]);
    expect(await numbers('reporter=me')).toStrictEqual([4, 2, 1]);
  });

  it('applies every kind of filter together', async () => {
    expect(await numbers(`category=${BUG}&state=open&assignee=${teamId}`)).toStrictEqual([5, 1]);
    expect(await numbers(`category=${BUG}&priority=${PRIORITY.high}`)).toStrictEqual([1]);
    expect(await numbers(`state=closed&assignee=me`)).toStrictEqual([]);
  });

  it('never shows a requester more than their own issues', async () => {
    expect(await numbers('', requesterCookie)).toStrictEqual([3]);
    expect(await numbers(`reporter=${adminId}`, requesterCookie)).toStrictEqual([]);
    expect((await list('group=status', requesterCookie)).groups).toStrictEqual([
      { key: STATUS.new, count: 1 },
    ]);
  });
});

describe('sorting', () => {
  // Each sort in its own order unless asked otherwise, ties newest first, no one last.
  it.each([
    ['', [5, 4, 3, 2, 1]],
    ['sort=key&order=asc', [1, 2, 3, 4, 5]],
    ['sort=title', [1, 4, 5, 2, 3]],
    ['sort=title&order=desc', [3, 2, 5, 4, 1]],
    ['sort=reporter', [4, 2, 1, 5, 3]],
    ['sort=category', [5, 1, 3, 2, 4]],
    ['sort=priority', [4, 1, 3, 2, 5]],
    ['sort=priority&order=asc', [5, 3, 2, 1, 4]],
    ['sort=status', [5, 3, 4, 1, 2]],
    ['sort=status&order=desc', [2, 1, 4, 5, 3]],
    ['sort=assignee', [4, 5, 1, 3, 2]],
    ['sort=assignee&order=desc', [5, 1, 4, 3, 2]],
    ['sort=updated', [3, 4, 2, 1, 5]],
    ['sort=updated&order=asc', [5, 1, 2, 4, 3]],
  ])('%s lists %j', async (query, expected) => {
    expect(await numbers(query)).toStrictEqual(expected);
  });
});

describe('grouping', () => {
  it('by status, with the size of each group', async () => {
    const page = await list('group=status');

    expect(page.rows.map(({ key }) => key)).toStrictEqual([
      'WEB-5',
      'WEB-3',
      'WEB-4',
      'WEB-1',
      'WEB-2',
    ]);
    expect(page.groups).toStrictEqual([
      { key: STATUS.new, count: 2 },
      { key: STATUS.toDo, count: 1 },
      { key: STATUS.inProgress, count: 1 },
      { key: STATUS.resolved, count: 1 },
    ]);
  });

  it('by priority, the most urgent first, sorted inside each group', async () => {
    const page = await list('group=priority&sort=key&order=asc');

    expect(page.rows.map(({ key }) => key)).toStrictEqual([
      'WEB-4',
      'WEB-1',
      'WEB-2',
      'WEB-3',
      'WEB-5',
    ]);
    expect(page.groups).toStrictEqual([
      { key: PRIORITY.urgent, count: 1 },
      { key: PRIORITY.high, count: 1 },
      { key: PRIORITY.normal, count: 2 },
      { key: PRIORITY.low, count: 1 },
    ]);
  });

  it('by assignee, by name, those assigned to no one last', async () => {
    const page = await list('group=assignee');

    expect(page.rows.map(({ key }) => key)).toStrictEqual([
      'WEB-4',
      'WEB-5',
      'WEB-1',
      'WEB-3',
      'WEB-2',
    ]);
    expect(page.groups).toStrictEqual([
      { key: adminId, count: 1 },
      { key: teamId, count: 2 },
      { key: null, count: 2 },
    ]);
  });

  it('counts only the issues the filters keep', async () => {
    expect((await list('group=status&state=open')).groups).toStrictEqual([
      { key: STATUS.new, count: 2 },
      { key: STATUS.toDo, count: 1 },
      { key: STATUS.inProgress, count: 1 },
    ]);
  });
});

describe('searching', () => {
  const searching = (search: string, cookie = adminCookie) =>
    numbers(new URLSearchParams({ search }).toString(), cookie);

  it('finds words of the title or description by their start, ignoring case and accents', async () => {
    expect(await searching('crash sav')).toStrictEqual([4]);
    expect(await searching('SIGN')).toStrictEqual([5]);
    expect(await searching('dash')).toStrictEqual([2]);
    expect(await searching('cafe')).toStrictEqual([2]);
    expect(await searching('crash link')).toStrictEqual([]);
  });

  it('finds any part of a title, even inside a word', async () => {
    expect(await searching('rash')).toStrictEqual([4]);
    expect(await searching('ign-in fa')).toStrictEqual([5]);
  });

  it('finds the issue named by its key or its number', async () => {
    expect(await searching('WEB-3')).toStrictEqual([3]);
    expect(await searching('web-3')).toStrictEqual([3]);
    expect(await searching('#3')).toStrictEqual([3]);
    expect(await searching('API-3')).toStrictEqual([]);
    expect(await searching('web 3')).toStrictEqual([3]);
    expect(await searching('WEB3')).toStrictEqual([3]);
  });

  it('finds the words a typo stands for, never correcting a word issues have', async () => {
    expect(await searching('crasj sav')).toStrictEqual([4]);
    expect(await searching('brokn')).toStrictEqual([1]);
    expect(await searching('slow')).toStrictEqual([2]);
  });

  it('applies the filters too, and never shows a requester more than their own', async () => {
    expect(await numbers('search=sign&state=closed')).toStrictEqual([]);
    expect(await numbers('search=on&sort=key&order=asc')).toStrictEqual([3, 4]);
    expect(await searching('crash', requesterCookie)).toStrictEqual([]);
    expect(await searching('typo', requesterCookie)).toStrictEqual([3]);
  });
});

describe('a list it cannot read', () => {
  it.each([
    `search=${'a'.repeat(101)}`,
    'status=not-an-id',
    'assignee=someone',
    'reporter=none',
    'state=archived',
    'sort=name',
    'order=up',
    'group=category',
    'page=0',
  ])('refuses %s', async (query) => {
    const response = await call('GET', `/api/v1/projects/WEB/issues?${query}`, adminCookie);

    expect(response.statusCode).toBe(400);
    expect(apiErrorSchema.parse(response.json()).error.code).toBe('VALIDATION_FAILED');
  });

  it('needs a session, and the project within reach', async () => {
    expect((await call('GET', '/api/v1/projects/WEB/issues?state=open', '')).statusCode).toBe(401);
    expect(
      (await call('GET', '/api/v1/projects/WEB/issues?state=open', outsiderCookie)).statusCode,
    ).toBe(404);
  });
});

describe('a project with its own workflow', () => {
  it('orders statuses as its own copy does', async () => {
    expect(
      (await call('POST', '/api/v1/projects/WEB/workflow/customize', adminCookie)).statusCode,
    ).toBe(204);
    const response = await call('GET', '/api/v1/projects/WEB/workflow', adminCookie);
    const { mode, statuses, transitions } = projectWorkflowResponseSchema.parse(response.json());
    const reversed = statuses
      .map(({ id, name, color, closes, isInitial }) => ({
        ref: id,
        name,
        color,
        closes,
        isInitial,
      }))
      .reverse();
    const saved = await call('PUT', '/api/v1/projects/WEB/workflow', adminCookie, {
      mode,
      statuses: reversed,
      transitions,
      removed: [],
    });
    expect(saved.statusCode).toBe(204);

    expect(await numbers('sort=status')).toStrictEqual([2, 1, 4, 5, 3]);
    expect((await list('group=status')).groups?.map(({ key }) => key)).toStrictEqual([
      STATUS.resolved,
      STATUS.inProgress,
      STATUS.toDo,
      STATUS.new,
    ]);
  });
});
