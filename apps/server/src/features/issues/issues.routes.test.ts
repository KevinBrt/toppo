import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_STATUSES,
} from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  assignedIssuesResponseSchema,
  assigneesResponseSchema,
  createIssueResponseSchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  issuesResponseSchema,
  projectsResponseSchema,
} from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
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
/** Team: sees, creates, edits and assigns every issue, deletes none. */
let teamCookie: string;
/** Requester: sees and reports their own issues only. */
let requesterCookie: string;
/** Team too, but kept out of the project. */
let outsiderCookie: string;
let teamId: string;
let requesterId: string;
let outsiderId: string;
let formerId: string;

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
  waiting: idOf(DEFAULT_STATUSES, 'waiting'),
  resolved: idOf(DEFAULT_STATUSES, 'resolved'),
};
const BUG = idOf(DEFAULT_CATEGORIES, 'bug');
const HIGH = idOf(DEFAULT_PRIORITIES, 'high');

function call(
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
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

async function report(
  cookie: string,
  body: object = { title: 'Broken link' },
  projectKey = 'WEB',
): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${projectKey}/issues`, cookie, body);
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function issue(key: string, cookie = adminCookie) {
  const response = await call('GET', `/api/v1/issues/${key}`, cookie);
  expect(response.statusCode).toBe(200);
  return issueResponseSchema.parse(response.json());
}

async function history(key: string, cookie = adminCookie) {
  const response = await call('GET', `/api/v1/issues/${key}/activities`, cookie);
  expect(response.statusCode).toBe(200);
  return issueActivitiesResponseSchema.parse(response.json()).rows;
}

async function listKeys(cookie: string): Promise<string[]> {
  const response = await call('GET', '/api/v1/projects/WEB/issues', cookie);
  expect(response.statusCode).toBe(200);
  return issuesResponseSchema.parse(response.json()).rows.map(({ key }) => key);
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
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  teamId = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  requesterId = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  outsiderId = await person('Alan Turing', 'alan@example.com', DEFAULT_ROLE_IDS.team);
  formerId = await person('Dan Former', 'dan@example.com', DEFAULT_ROLE_IDS.team);
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  requesterCookie = await signIn('rita@example.com');
  outsiderCookie = await signIn('alan@example.com');

  for (const key of ['WEB', 'OLD']) {
    const created = await call('POST', '/api/v1/projects', adminCookie, { key, name: key });
    expect(created.statusCode).toBe(201);
  }
  const added = await call('POST', '/api/v1/projects/WEB/members', adminCookie, {
    userIds: [teamId, requesterId, formerId],
    roleId: null,
  });
  expect(added.statusCode).toBe(204);
  await context.database.db
    .update(schema.users)
    .set({ deactivatedAt: new Date() })
    .where(eq(schema.users.id, formerId));
  return () => app.close();
});

describe('reporting an issue', () => {
  it('numbers it from the project, in the initial status, with the default fields', async () => {
    const first = await report(teamCookie);
    const second = await report(teamCookie, { title: 'Slow page', description: '# Steps' });

    expect([first, second]).toStrictEqual(['WEB-1', 'WEB-2']);
    const reported = await issue(first, teamCookie);
    expect(reported).toMatchObject({
      key: 'WEB-1',
      title: 'Broken link',
      description: '',
      project: { key: 'WEB', name: 'WEB' },
      status: { id: STATUS.new, closes: false },
      category: { id: idOf(DEFAULT_CATEGORIES, 'request') },
      priority: { id: idOf(DEFAULT_PRIORITIES, 'normal'), level: 2 },
      assignee: null,
      reporter: { id: teamId, name: 'Grace Hopper' },
      closedAt: null,
      actions: ['editText', 'attach', 'editFields', 'changeStatus', 'assign', 'comment', 'follow'],
    });
    expect((await history(first)).map(({ type }) => type)).toStrictEqual(['issue.created']);
  });

  it('never gives a number twice, even to issues reported at the same moment', async () => {
    const keys = await Promise.all(
      Array.from({ length: 5 }, (_, index) => report(teamCookie, { title: `Race ${index}` })),
    );

    expect([...keys].sort()).toStrictEqual(['WEB-3', 'WEB-4', 'WEB-5', 'WEB-6', 'WEB-7']);
  });

  it('takes the category, priority and assignee given', async () => {
    const key = await report(adminCookie, {
      title: 'Crash on save',
      categoryId: BUG,
      priorityId: HIGH,
      assigneeId: teamId,
    });

    expect(await issue(key)).toMatchObject({
      category: { id: BUG, name: 'Bug' },
      priority: { id: HIGH, level: 3 },
      assignee: { id: teamId, name: 'Grace Hopper' },
    });
  });

  it.each([
    [{ categoryId: '01a1569b-9900-7000-8000-00000000dead' }, 'INVALID_CATEGORY'],
    [{ priorityId: '01a1569b-9900-7000-8000-00000000dead' }, 'INVALID_PRIORITY'],
  ])('refuses %j', async (fields, code) => {
    const response = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
      title: 'Odd',
      ...fields,
    });

    expect(response.statusCode).toBe(400);
    expect(errorCode(response)).toBe(code);
  });

  it('gives issues only to active members who reach the project', async () => {
    for (const assigneeId of [outsiderId, formerId]) {
      const response = await call('POST', '/api/v1/projects/WEB/issues', adminCookie, {
        title: 'Nobody here',
        assigneeId,
      });
      expect(response.statusCode).toBe(400);
      expect(errorCode(response)).toBe('INVALID_ASSIGNEE');
    }
  });

  it('lets a requester report an issue, not give it to someone', async () => {
    const assigning = await call('POST', '/api/v1/projects/WEB/issues', requesterCookie, {
      title: 'Please help',
      assigneeId: teamId,
    });

    expect(assigning.statusCode).toBe(403);
    expect(await report(requesterCookie, { title: 'Please help' })).toBe('WEB-9');
  });

  it('needs a title, a session, and the project within reach', async () => {
    const blank = await call('POST', '/api/v1/projects/WEB/issues', teamCookie, { title: '  ' });
    const anonymous = await call('POST', '/api/v1/projects/WEB/issues', '', { title: 'Hi' });
    const outsider = await call('POST', '/api/v1/projects/WEB/issues', outsiderCookie, {
      title: 'Hi',
    });

    expect(blank.statusCode).toBe(400);
    expect(anonymous.statusCode).toBe(401);
    expect(outsider.statusCode).toBe(404);
    expect(errorCode(outsider)).toBe('PROJECT_NOT_FOUND');
  });
});

describe('seeing issues', () => {
  it('lists every issue to the team, newest first, and only their own to a requester', async () => {
    const all = await listKeys(teamCookie);

    expect(all[0]).toBe('WEB-9');
    expect(all).toHaveLength(9);
    expect(await listKeys(requesterCookie)).toStrictEqual(['WEB-9']);
  });

  it('counts open and urgent issues on the projects screen, for those who manage them', async () => {
    await context.database.db
      .update(schema.issues)
      .set({ priorityId: idOf(DEFAULT_PRIORITIES, 'urgent') })
      .where(eq(schema.issues.number, 3));
    const managed = await call('GET', '/api/v1/projects?scope=managed', adminCookie);
    const reachable = await call('GET', '/api/v1/projects', teamCookie);

    const web = projectsResponseSchema.parse(managed.json()).rows.find(({ key }) => key === 'WEB');
    expect(web?.issues).toMatchObject({ open: 9, urgent: 1 });
    expect(web?.issues?.lastActivityAt).not.toBeNull();
    expect(projectsResponseSchema.parse(reachable.json()).rows[0]?.issues).toBeNull();
  });

  it('hides the issues of others from a requester, as if they did not exist', async () => {
    const hidden = await call('GET', '/api/v1/issues/WEB-1', requesterCookie);
    const missing = await call('GET', '/api/v1/issues/WEB-999', teamCookie);

    expect(hidden.statusCode).toBe(404);
    expect(errorCode(hidden)).toBe('ISSUE_NOT_FOUND');
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('ISSUE_NOT_FOUND');
    expect((await issue('WEB-9', requesterCookie)).actions).toStrictEqual([
      'editText',
      'attach',
      'comment',
      'follow',
    ]);
  });

  it('names a deleted reporter by nothing but their id', async () => {
    await context.database.db
      .update(schema.issues)
      .set({ reporterId: formerId })
      .where(eq(schema.issues.number, 8));
    await context.database.db
      .update(schema.users)
      .set({ name: '', deletedAt: new Date() })
      .where(eq(schema.users.id, formerId));

    expect((await issue('WEB-8')).reporter).toStrictEqual({ id: formerId, name: null });
  });

  it('offers the project’s statuses, the moves between them, categories and priorities', async () => {
    const response = await call('GET', '/api/v1/projects/WEB/issue-fields', requesterCookie);

    const fields = issueFieldsResponseSchema.parse(response.json());
    expect(fields.statuses.map(({ id }) => id)).toStrictEqual(Object.values(STATUS));
    expect(fields.statuses[0]).toMatchObject({
      isInitial: true,
      next: [STATUS.toDo, STATUS.inProgress, STATUS.resolved],
    });
    expect(fields.categories.find(({ isDefault }) => isDefault)?.name).toBe('Request');
    expect(fields.priorities.map(({ level }) => level)).toStrictEqual([1, 2, 3, 4]);
  });
});

describe('changing an issue', () => {
  it('changes only what changed, with one activity for each', async () => {
    const response = await call('PATCH', '/api/v1/issues/WEB-1', teamCookie, {
      title: 'Broken link on /about',
      description: '',
      priorityId: HIGH,
    });

    expect(response.statusCode).toBe(204);
    expect(await issue('WEB-1')).toMatchObject({
      title: 'Broken link on /about',
      priority: { id: HIGH },
    });
    // Newest first; changes made together keep the order they were made in.
    const changes = await history('WEB-1');
    expect(changes.map(({ type }) => type)).toStrictEqual([
      'issue.titleChanged',
      'issue.priorityChanged',
      'issue.created',
    ]);
    expect(changes[1]).toMatchObject({
      actor: { id: teamId, name: 'Grace Hopper' },
      payload: { from: { name: 'Normal', level: 2 }, to: { name: 'High', level: 3 } },
    });
  });

  it('keeps the old and the new description', async () => {
    await call('PATCH', '/api/v1/issues/WEB-2', teamCookie, { description: '# Steps\n1. Open' });

    expect((await history('WEB-2')).at(0)).toMatchObject({
      type: 'issue.descriptionChanged',
      payload: { from: '# Steps', to: '# Steps\n1. Open' },
    });
  });

  it('lets a reporter fix the words of their issue, and nothing more', async () => {
    const words = await call('PATCH', '/api/v1/issues/WEB-9', requesterCookie, {
      title: 'Please help with the invoice',
    });
    const priority = await call('PATCH', '/api/v1/issues/WEB-9', requesterCookie, {
      priorityId: HIGH,
    });

    expect(words.statusCode).toBe(204);
    expect(priority.statusCode).toBe(403);
    expect(errorCode(priority)).toBe('FORBIDDEN');
  });

  it('refuses nothing to change, and a category that does not exist', async () => {
    const empty = await call('PATCH', '/api/v1/issues/WEB-1', teamCookie, {});
    const unknown = await call('PATCH', '/api/v1/issues/WEB-1', teamCookie, {
      categoryId: '01a1569b-9900-7000-8000-00000000dead',
    });

    expect(empty.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(errorCode(unknown)).toBe('INVALID_CATEGORY');
  });
});

describe('moving an issue through the workflow', () => {
  const move = (key: string, statusId: string, cookie = adminCookie) =>
    call('PUT', `/api/v1/issues/${key}/status`, cookie, { statusId });

  it('only to a status the workflow allows from the current one, administrators included', async () => {
    const skipping = await move('WEB-1', STATUS.waiting);
    const allowed = await move('WEB-1', STATUS.inProgress);

    expect(skipping.statusCode).toBe(409);
    expect(errorCode(skipping)).toBe('STATUS_NOT_ALLOWED');
    expect(allowed.statusCode).toBe(204);
    expect((await history('WEB-1')).at(0)).toMatchObject({
      type: 'issue.statusChanged',
      payload: { from: { name: 'New' }, to: { name: 'In progress' } },
    });
  });

  it('closes the issue in a done status, and reopens it', async () => {
    expect((await move('WEB-1', STATUS.resolved)).statusCode).toBe(204);
    const closed = await issue('WEB-1');
    expect(closed.closedAt).not.toBeNull();

    expect((await move('WEB-1', STATUS.toDo)).statusCode).toBe(204);
    expect((await issue('WEB-1')).closedAt).toBeNull();
  });

  it('is left to those who may change issues', async () => {
    const response = await move('WEB-9', STATUS.resolved, requesterCookie);

    expect(response.statusCode).toBe(403);
  });
});

describe('assigning an issue', () => {
  const assign = (key: string, assigneeId: string | null, cookie = teamCookie) =>
    call('PUT', `/api/v1/issues/${key}/assignee`, cookie, { assigneeId });

  it('gives it to someone who reaches the project, or to nobody', async () => {
    expect((await assign('WEB-2', requesterId)).statusCode).toBe(204);
    expect((await issue('WEB-2')).assignee).toStrictEqual({ id: requesterId, name: 'Rita Client' });
    expect((await assign('WEB-2', null)).statusCode).toBe(204);

    const changes = await history('WEB-2');
    expect(changes.slice(0, 2).map(({ payload }) => payload)).toStrictEqual([
      { from: { id: requesterId, name: 'Rita Client' }, to: null },
      { from: null, to: { id: requesterId, name: 'Rita Client' } },
    ]);
  });

  it('refuses someone out of the project, and a requester assigning', async () => {
    const outsider = await assign('WEB-2', outsiderId);
    const requester = await assign('WEB-9', teamId, requesterCookie);

    expect(outsider.statusCode).toBe(400);
    expect(errorCode(outsider)).toBe('INVALID_ASSIGNEE');
    expect(requester.statusCode).toBe(403);
  });

  it('suggests the active members who reach the project', async () => {
    const response = await call('GET', '/api/v1/projects/WEB/assignees', teamCookie);

    expect(
      assigneesResponseSchema.parse(response.json()).people.map(({ name }) => name),
    ).toStrictEqual(['Ada Lovelace', 'Grace Hopper', 'Rita Client']);
  });
});

describe('deleting an issue', () => {
  it('is for those who may, leaves its key and id in a trace, and its number is never reused', async () => {
    const { id } = await issue('WEB-2');
    const team = await call('DELETE', '/api/v1/issues/WEB-2', teamCookie);
    const admin = await call('DELETE', '/api/v1/issues/WEB-2', adminCookie);

    expect(team.statusCode).toBe(403);
    expect(admin.statusCode).toBe(204);
    expect((await call('GET', '/api/v1/issues/WEB-2', adminCookie)).statusCode).toBe(404);
    const traces = await context.database.db
      .select({ actorId: schema.activities.actorId, payload: schema.activities.payload })
      .from(schema.activities)
      .where(and(eq(schema.activities.type, 'issue.deleted'), isNull(schema.activities.issueId)));
    expect(traces).toHaveLength(1);
    expect(traces[0]?.payload).toStrictEqual({ key: 'WEB-2', issueId: id });
    expect(await report(teamCookie, { title: 'After the deletion' })).toBe('WEB-10');
  });
});

describe('an archived project', () => {
  it('keeps its issues readable and unchanged', async () => {
    const created = await call('POST', '/api/v1/projects/OLD/issues', adminCookie, {
      title: 'Legacy',
    });
    expect(created.statusCode).toBe(201);
    expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);

    const change = await call('PATCH', '/api/v1/issues/OLD-1', adminCookie, { title: 'Again' });
    const another = await call('POST', '/api/v1/projects/OLD/issues', adminCookie, {
      title: 'More',
    });

    expect((await issue('OLD-1')).title).toBe('Legacy');
    expect(change.statusCode).toBe(409);
    expect(errorCode(change)).toBe('PROJECT_ARCHIVED');
    expect(another.statusCode).toBe(409);
  });
});

describe('issues assigned to me', () => {
  const URGENT = idOf(DEFAULT_PRIORITIES, 'urgent');

  async function assigned(cookie: string) {
    const response = await call('GET', '/api/v1/issues/assigned', cookie);
    expect(response.statusCode).toBe(200);
    return assignedIssuesResponseSchema.parse(response.json());
  }

  const keysAssigned = async (cookie: string) =>
    (await assigned(cookie)).rows.map(({ key }) => key);

  it('lists them in every project, open or closed, the most urgent first', async () => {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key: 'APP', name: 'Mobile app' }))
        .statusCode,
    ).toBe(201);
    const added = await call('POST', '/api/v1/projects/APP/members', adminCookie, {
      userIds: [teamId],
      roleId: null,
    });
    expect(added.statusCode).toBe(204);
    await report(adminCookie, { title: 'Site down', priorityId: URGENT, assigneeId: teamId });
    await report(adminCookie, { title: 'Nobody’s yet', priorityId: URGENT });
    await report(adminCookie, { title: 'Typo on the home screen', assigneeId: teamId }, 'APP');
    await report(
      adminCookie,
      { title: 'Sign-in fails', priorityId: HIGH, assigneeId: teamId },
      'APP',
    );
    const resolved = await call('PUT', '/api/v1/issues/APP-2/status', adminCookie, {
      statusId: STATUS.resolved,
    });
    expect(resolved.statusCode).toBe(204);
    // Given in a project archived since: nothing is left to do there.
    const [old] = await context.database.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.key, 'OLD'));
    if (!old) {
      throw new Error('No project OLD');
    }
    await context.database.db
      .insert(schema.projectMembers)
      .values({ projectId: old.id, userId: teamId });
    await context.database.db
      .update(schema.issues)
      .set({ assigneeId: teamId })
      .where(eq(schema.issues.projectId, old.id));

    const mine = await assigned(teamCookie);
    expect(mine.rows.map(({ key }) => key)).toStrictEqual(['WEB-11', 'APP-2', 'WEB-8', 'APP-1']);
    expect(mine.matching).toBe(4);
    expect(mine.rows[1]).toMatchObject({
      project: { key: 'APP', name: 'Mobile app' },
      status: { id: STATUS.resolved, closes: true },
      assignee: { id: teamId, name: 'Grace Hopper' },
    });
    expect(await keysAssigned(adminCookie)).toStrictEqual([]);
  });

  it('leaves out what the caller may no longer read', async () => {
    const removed = await call('DELETE', `/api/v1/projects/APP/members/${teamId}`, adminCookie);
    const assign = (key: string) =>
      call('PUT', `/api/v1/issues/${key}/assignee`, teamCookie, { assigneeId: requesterId });

    expect(removed.statusCode).toBe(204);
    expect(await keysAssigned(teamCookie)).toStrictEqual(['WEB-11', 'WEB-8']);
    // A requester reads only the issues they reported, even when given someone else's.
    expect((await assign('WEB-1')).statusCode).toBe(204);
    expect((await assign('WEB-9')).statusCode).toBe(204);
    expect(await keysAssigned(requesterCookie)).toStrictEqual(['WEB-9']);
  });

  it('needs a session and a page that exists', async () => {
    const anonymous = await call('GET', '/api/v1/issues/assigned', '');
    const page = await call('GET', '/api/v1/issues/assigned?page=0', teamCookie);

    expect(anonymous.statusCode).toBe(401);
    expect(page.statusCode).toBe(400);
  });
});
