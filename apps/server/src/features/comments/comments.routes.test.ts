import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  addCommentResponseSchema,
  apiErrorSchema,
  COMMENT_BODY_MAX_LENGTH,
  createIssueResponseSchema,
  type IssueActivity,
  issueActivitiesResponseSchema,
  issueResponseSchema,
  MENTIONS_MAX,
  mentionableResponseSchema,
} from '@toppo-tracker/shared';
import { and, eq, sql } from 'drizzle-orm';
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
/** The administrator: moderates comments everywhere. */
let adminCookie: string;
/** Team: comments on every issue, moderates none. */
let graceCookie: string;
let alanCookie: string;
/** Requester: comments on the issues they reported. */
let ritaCookie: string;
const ids = { ada: '', grace: '', alan: '', rita: '' };

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
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

async function report(projectKey: string, cookie: string): Promise<string> {
  const response = await call('POST', `/api/v1/projects/${projectKey}/issues`, cookie, {
    title: 'Broken link',
  });
  expect(response.statusCode).toBe(201);
  return createIssueResponseSchema.parse(response.json()).key;
}

async function comment(issueKey: string, cookie: string, body: string): Promise<string> {
  const response = await call('POST', `/api/v1/issues/${issueKey}/comments`, cookie, { body });
  expect(response.statusCode).toBe(201);
  return addCommentResponseSchema.parse(response.json()).id;
}

async function history(issueKey: string, cookie = adminCookie) {
  const response = await call('GET', `/api/v1/issues/${issueKey}/activities`, cookie);
  expect(response.statusCode).toBe(200);
  return issueActivitiesResponseSchema.parse(response.json());
}

/** The comments the history shows, newest first. */
async function commentsOf(issueKey: string, cookie = adminCookie) {
  return (await history(issueKey, cookie)).rows.flatMap((entry: IssueActivity) =>
    entry.type === 'issue.commented' ? [{ by: entry.actor.name, ...entry.payload.comment }] : [],
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
  const person = (name: string, email: string, instanceRoleId: string) =>
    createTestUser(context.database, { name, email, password: PASSWORD, instanceRoleId });
  ids.grace = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  ids.alan = await person('Alan Turing', 'alan@example.com', DEFAULT_ROLE_IDS.team);
  ids.rita = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  const members = [ids.grace, ids.alan, ids.rita];
  adminCookie = await signIn('ada@example.com');
  graceCookie = await signIn('grace@example.com');
  alanCookie = await signIn('alan@example.com');
  ritaCookie = await signIn('rita@example.com');
  ids.ada = (
    (await call('GET', '/api/v1/me', adminCookie)).json() as { user: { id: string } }
  ).user.id;
  for (const key of ['WEB', 'OLD']) {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key, name: key })).statusCode,
    ).toBe(201);
    const added = await call('POST', `/api/v1/projects/${key}/members`, adminCookie, {
      userIds: members,
      roleId: null,
    });
    expect(added.statusCode).toBe(204);
  }
  return () => app.close();
});

describe('commenting', () => {
  it('shows the comment first in the history, with what each reader may do on it', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'Fixed in **1.2**.');

    expect(await commentsOf(key, graceCookie)).toStrictEqual([
      {
        by: 'Grace Hopper',
        id,
        body: 'Fixed in **1.2**.',
        editedAt: null,
        attachments: [],
        mentions: [],
        actions: ['edit', 'delete'],
      },
    ]);
    expect((await commentsOf(key, adminCookie))[0]?.actions).toStrictEqual(['delete']);
    expect((await commentsOf(key, alanCookie))[0]?.actions).toStrictEqual([]);
    expect((await history(key)).rows[0]?.type).toBe('issue.commented');
  });

  it('counts as a change of the issue', async () => {
    const key = await report('WEB', adminCookie);
    const before = issueResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}`, adminCookie)).json(),
    );

    await comment(key, graceCookie, 'Seen.');

    const after = issueResponseSchema.parse(
      (await call('GET', `/api/v1/issues/${key}`, adminCookie)).json(),
    );
    expect(after.updatedAt > before.updatedAt).toBe(true);
    expect(after.actions).toContain('comment');
  });

  it('lets a requester comment on the issues they reported only', async () => {
    const theirs = await report('WEB', ritaCookie);
    const others = await report('WEB', adminCookie);

    await comment(theirs, ritaCookie, 'Any news?');
    const elsewhere = await call('POST', `/api/v1/issues/${others}/comments`, ritaCookie, {
      body: 'Me too',
    });

    expect(await commentsOf(theirs, ritaCookie)).toMatchObject([{ body: 'Any news?' }]);
    expect(elsewhere.statusCode).toBe(404);
  });

  it('refuses a blank comment, one too long, and no session', async () => {
    const key = await report('WEB', adminCookie);
    const url = `/api/v1/issues/${key}/comments`;

    for (const body of ['  \n ', 'a'.repeat(COMMENT_BODY_MAX_LENGTH + 1)]) {
      const refused = await call('POST', url, graceCookie, { body });
      expect(refused.statusCode).toBe(400);
      expect(errorCode(refused)).toBe('VALIDATION_FAILED');
    }
    expect((await call('POST', url, '', { body: 'Hello' })).statusCode).toBe(401);
  });
});

describe('editing a comment', () => {
  it('changes its words, marked as edited, without a step of its own in the history', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'Fixed in 1.2.');
    const steps = (await history(key)).matching;

    const edited = await call('PATCH', `/api/v1/issues/${key}/comments/${id}`, graceCookie, {
      body: 'Fixed in 1.3.',
    });

    expect(edited.statusCode).toBe(204);
    const [shown] = await commentsOf(key);
    expect(shown).toMatchObject({ id, body: 'Fixed in 1.3.' });
    expect(shown?.editedAt).not.toBeNull();
    expect((await history(key)).matching).toBe(steps);
  });

  it('is for its author alone: a moderator changes nobody’s words', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'Mine.');
    const url = `/api/v1/issues/${key}/comments/${id}`;

    const byModerator = await call('PATCH', url, adminCookie, { body: 'Theirs now.' });
    const byOther = await call('PATCH', url, alanCookie, { body: 'Mine now.' });

    expect(byModerator.statusCode).toBe(403);
    expect(byOther.statusCode).toBe(403);
    expect(errorCode(byOther)).toBe('FORBIDDEN');
    expect((await commentsOf(key))[0]?.body).toBe('Mine.');
  });

  it('records nothing when the words stay the same', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'Same.');

    const same = await call('PATCH', `/api/v1/issues/${key}/comments/${id}`, graceCookie, {
      body: 'Same.',
    });

    expect(same.statusCode).toBe(204);
    expect((await commentsOf(key))[0]?.editedAt).toBeNull();
  });
});

/** Whom the activities about a comment named, oldest first: one list per activity. */
async function namedBy(commentId: string): Promise<unknown[]> {
  const recorded = await context.database.db
    .select({ payload: schema.activities.payload })
    .from(schema.activities)
    .where(sql`${schema.activities.payload} ->> 'commentId' = ${commentId}`)
    .orderBy(schema.activities.id);
  return recorded.map(({ payload }) => (payload as { mentioned?: unknown }).mentioned);
}

async function mentionable(issueKey: string, cookie: string, search = '') {
  const response = await call(
    'GET',
    `/api/v1/issues/${issueKey}/mentionable?search=${encodeURIComponent(search)}`,
    cookie,
  );
  expect(response.statusCode).toBe(200);
  return mentionableResponseSchema.parse(response.json()).people.map(({ name }) => name);
}

describe('naming people in a comment', () => {
  it('offers those who see the issue, by name, but the one writing', async () => {
    const key = await report('WEB', adminCookie);

    expect(await mentionable(key, graceCookie)).toStrictEqual(['Ada Lovelace', 'Alan Turing']);
    expect(await mentionable(key, graceCookie, 'ala')).toStrictEqual(['Alan Turing']);
    expect(await mentionable(key, graceCookie, 'example.com')).toStrictEqual([]);
  });

  it('tells each person by the role they work with in the project', async () => {
    const key = await report('WEB', adminCookie);
    const { db } = context.database;
    const supportId = uuidv7();
    await db
      .insert(schema.roles)
      .values({ id: supportId, name: 'Support', permissions: ['issue.read', 'comment.create'] });
    const alanInWeb = and(
      eq(schema.projectMembers.userId, ids.alan),
      eq(
        schema.projectMembers.projectId,
        sql`(select ${schema.projects.id} from ${schema.projects} where ${schema.projects.key} = 'WEB')`,
      ),
    );
    await db.update(schema.projectMembers).set({ roleId: supportId }).where(alanInWeb);

    const response = await call('GET', `/api/v1/issues/${key}/mentionable`, graceCookie);
    await db.update(schema.projectMembers).set({ roleId: null }).where(alanInWeb);

    const { people } = mentionableResponseSchema.parse(response.json());
    expect(people.map(({ name, role }) => [name, role.name])).toStrictEqual([
      ['Ada Lovelace', 'Administrator'],
      ['Alan Turing', 'Support'],
    ]);
  });

  it('offers a requester only the people already on their issue', async () => {
    const key = await report('WEB', ritaCookie);
    await comment(key, graceCookie, 'Looking into it.');

    expect(await mentionable(key, ritaCookie)).toStrictEqual(['Grace Hopper']);
    expect(await mentionable(key, adminCookie)).toStrictEqual([
      'Alan Turing',
      'Grace Hopper',
      'Rita Client',
    ]);
  });

  it('records whom a comment names, once each and never its author', async () => {
    const key = await report('WEB', adminCookie);
    const response = await call('POST', `/api/v1/issues/${key}/comments`, graceCookie, {
      body: '@Alan Turing, can you look?',
      mentions: [ids.alan, ids.alan, ids.grace],
    });
    expect(response.statusCode).toBe(201);
    const { id } = addCommentResponseSchema.parse(response.json());

    expect(await namedBy(id)).toStrictEqual([[ids.alan]]);
  });

  it('refuses to name someone who cannot be named, or too many people', async () => {
    const key = await report('WEB', adminCookie);
    const url = `/api/v1/issues/${key}/comments`;

    // Rita sees only the issues she reported; an unknown id names nobody.
    for (const mentions of [[ids.rita], ['01a1569b-9900-7000-8000-00000000dead']]) {
      const refused = await call('POST', url, graceCookie, { body: 'Hello', mentions });
      expect(refused.statusCode).toBe(400);
      expect(errorCode(refused)).toBe('INVALID_MENTION');
    }
    const tooMany = await call('POST', url, graceCookie, {
      body: 'Hello',
      mentions: Array.from({ length: MENTIONS_MAX + 1 }, () => ids.alan),
    });
    expect(tooMany.statusCode).toBe(400);
    expect(await commentsOf(key)).toStrictEqual([]);
  });

  it('records, on an edit, only the people named for the first time', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'Hello');
    const url = `/api/v1/issues/${key}/comments/${id}`;

    for (const [body, mentions] of [
      ['@Alan Turing', [ids.alan]],
      ['@Alan Turing @Ada Lovelace', [ids.alan, ids.ada]],
    ] as const) {
      expect((await call('PATCH', url, graceCookie, { body, mentions })).statusCode).toBe(204);
    }

    expect(await namedBy(id)).toStrictEqual([[], [ids.alan], [ids.ada]]);
    expect((await commentsOf(key))[0]?.mentions).toStrictEqual([
      { id: ids.alan, name: 'Alan Turing' },
      { id: ids.ada, name: 'Ada Lovelace' },
    ]);
  });
});

describe('deleting a comment', () => {
  it('is for its author or a moderator, and leaves no trace in the history', async () => {
    const key = await report('WEB', adminCookie);
    const first = await comment(key, graceCookie, 'First.');
    const second = await comment(key, graceCookie, 'Second.');
    const steps = (await history(key)).matching;

    const byOther = await call('DELETE', `/api/v1/issues/${key}/comments/${first}`, alanCookie);
    const byAuthor = await call('DELETE', `/api/v1/issues/${key}/comments/${first}`, graceCookie);
    const byModerator = await call(
      'DELETE',
      `/api/v1/issues/${key}/comments/${second}`,
      adminCookie,
    );

    expect(byOther.statusCode).toBe(403);
    expect(byAuthor.statusCode).toBe(204);
    expect(byModerator.statusCode).toBe(204);
    expect(await commentsOf(key)).toStrictEqual([]);
    expect((await history(key)).matching).toBe(steps - 2);
  });

  it('keeps its id only among the activities, never its words', async () => {
    const key = await report('WEB', adminCookie);
    const id = await comment(key, graceCookie, 'A secret.');
    expect(
      (await call('DELETE', `/api/v1/issues/${key}/comments/${id}`, graceCookie)).statusCode,
    ).toBe(204);

    const recorded = await context.database.db
      .select({ type: schema.activities.type, payload: schema.activities.payload })
      .from(schema.activities)
      .innerJoin(schema.issues, eq(schema.issues.id, schema.activities.issueId))
      .where(eq(schema.issues.number, Number(key.split('-')[1])));
    const about = recorded.filter(({ type }) => type.startsWith('issue.comment'));
    expect(about).toStrictEqual([
      { type: 'issue.commented', payload: { commentId: id, mentioned: [] } },
      { type: 'issue.commentDeleted', payload: { commentId: id } },
    ]);
  });

  it('answers 404 for a comment of another issue, or one that does not exist', async () => {
    const key = await report('WEB', adminCookie);
    const other = await report('WEB', adminCookie);
    const id = await comment(other, graceCookie, 'Elsewhere.');

    const misplaced = await call('DELETE', `/api/v1/issues/${key}/comments/${id}`, graceCookie);
    const missing = await call(
      'PATCH',
      `/api/v1/issues/${key}/comments/01a1569b-9900-7000-8000-00000000dead`,
      graceCookie,
      { body: 'Hello' },
    );

    expect(misplaced.statusCode).toBe(404);
    expect(errorCode(misplaced)).toBe('COMMENT_NOT_FOUND');
    expect(missing.statusCode).toBe(404);
  });
});

describe('an archived project', () => {
  it('keeps its comments, and takes no new one', async () => {
    const key = await report('OLD', adminCookie);
    const id = await comment(key, graceCookie, 'Before.');
    expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);

    const added = await call('POST', `/api/v1/issues/${key}/comments`, graceCookie, {
      body: 'After.',
    });
    const deleted = await call('DELETE', `/api/v1/issues/${key}/comments/${id}`, graceCookie);

    expect(added.statusCode).toBe(409);
    expect(errorCode(added)).toBe('PROJECT_ARCHIVED');
    expect(deleted.statusCode).toBe(409);
    expect(await commentsOf(key, graceCookie)).toMatchObject([{ body: 'Before.', actions: [] }]);
  });
});
