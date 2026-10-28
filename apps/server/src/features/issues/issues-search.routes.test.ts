import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  apiErrorSchema,
  ISSUE_SEARCH_LIMIT,
  issueSearchResponseSchema,
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
  testServices,
} from '../../test-helpers.ts';
import { rebuildIssueWordsJob } from './jobs/rebuild-issue-words.job.ts';
import { rebuildProjectWords } from './utils/issue-search.util.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
/** Team, a member of WEB only. */
let teamCookie: string;
/** Requester in WEB: sees their own issues only. */
let requesterCookie: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

function call(method: 'GET' | 'POST', url: string, cookie: string, body?: object) {
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

async function report(projectKey: string, issue: object, cookie = adminCookie): Promise<void> {
  const response = await call('POST', `/api/v1/projects/${projectKey}/issues`, cookie, issue);
  expect(response.statusCode).toBe(201);
}

/** The keys of the issues `search` finds, in order. */
async function found(search: string, cookie = adminCookie): Promise<string[]> {
  const response = await call(
    'GET',
    `/api/v1/issues/search?${new URLSearchParams({ search })}`,
    cookie,
  );
  expect(response.statusCode).toBe(200);
  return issueSearchResponseSchema.parse(response.json()).rows.map(({ key }) => key);
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
  const teamId = await person('Grace Hopper', 'grace@example.com', DEFAULT_ROLE_IDS.team);
  const requesterId = await person('Rita Client', 'rita@example.com', DEFAULT_ROLE_IDS.requester);
  adminCookie = await signIn('ada@example.com');
  teamCookie = await signIn('grace@example.com');
  requesterCookie = await signIn('rita@example.com');

  for (const key of ['WEB', 'API', 'OLD']) {
    expect(
      (await call('POST', '/api/v1/projects', adminCookie, { key, name: key })).statusCode,
    ).toBe(201);
  }
  const added = await call('POST', '/api/v1/projects/WEB/members', adminCookie, {
    userIds: [teamId, requesterId],
    roleId: null,
  });
  expect(added.statusCode).toBe(204);

  await report('WEB', { title: 'Crash on save' });
  await report('API', { title: 'Crash when saving a token' });
  await report('API', { title: 'Rate limit', description: 'Too many requests make it crash.' });
  await report(
    'WEB',
    { title: 'Typo on home', description: 'It may crash older browsers.' },
    requesterCookie,
  );
  await report('API', { title: 'Follow-up of API-2' });
  await report('OLD', { title: 'Crash in the old project' });
  expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);
  return () => app.close();
});

describe('searching every project', () => {
  it('finds the issues of every project reached, title words first, then the latest', async () => {
    expect(await found('crash')).toStrictEqual(['API-1', 'WEB-1', 'WEB-2', 'API-2']);
  });

  it('puts the issue named by its key first', async () => {
    expect(await found('api-2')).toStrictEqual(['API-2', 'API-3']);
  });

  it('finds by its number alone the issue so numbered in every project, the latest first', async () => {
    expect(await found('1')).toStrictEqual(['API-1', 'WEB-1']);
    expect(await found('#3')).toStrictEqual(['API-3']);
  });

  it('reads a key however it is written', async () => {
    for (const search of ['web 2', 'WEB_2', 'web2']) {
      expect((await found(search))[0], search).toBe('WEB-2');
    }
  });

  it('finds the words a typo stands for, as soon as an issue is written', async () => {
    await report('API', { title: 'Expired tokens', description: 'The renewal fails at night.' });

    expect(await found('crasj')).toStrictEqual(['API-1', 'WEB-1', 'WEB-2', 'API-2']);
    expect(await found('renewl tokn')).toStrictEqual(['API-4']);
    // A word issues have, or begin with, is never corrected.
    expect(await found('rate')).toStrictEqual(['API-2']);
  });

  it('leaves out archived projects, and those out of reach', async () => {
    expect(await found('OLD-1')).toStrictEqual([]);
    expect(await found('crash', teamCookie)).toStrictEqual(['WEB-1', 'WEB-2']);
    expect(await found('API-1', teamCookie)).toStrictEqual([]);
  });

  it('shows a requester their own issues only', async () => {
    expect(await found('crash', requesterCookie)).toStrictEqual(['WEB-2']);
  });

  it(`shows the best ${ISSUE_SEARCH_LIMIT} at most`, async () => {
    for (let index = 0; index <= ISSUE_SEARCH_LIMIT; index += 1) {
      await report('WEB', { title: `Flaky test ${index}` });
    }

    expect(await found('flaky')).toHaveLength(ISSUE_SEARCH_LIMIT);
  });
});

describe('the words a typo is corrected to', () => {
  const wordsOf = async (projectId: string) =>
    (
      await context.database.db
        .select({ word: schema.issueWords.word })
        .from(schema.issueWords)
        .where(eq(schema.issueWords.projectId, projectId))
    ).map(({ word }) => word);
  const projectId = async (key: string) => {
    const [project] = await context.database.db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(eq(schema.projects.key, key));
    return project?.id ?? '';
  };

  it('are those of the issues as they are once rebuilt, a word no issue has any more gone', async () => {
    const web = await projectId('WEB');
    await context.database.db
      .insert(schema.issueWords)
      .values({ id: uuidv7(), projectId: web, word: 'zeppelin' });

    const kept = await context.database.db.transaction((tx) => rebuildProjectWords(tx, web));

    expect(await wordsOf(web)).not.toContain('zeppelin');
    expect(await wordsOf(web)).toContain('crash');
    expect(kept).toBe((await wordsOf(web)).length);
  });

  it('are rebuilt each night project by project, each in a job of its own', async () => {
    await context.database.db.delete(schema.jobs);

    await context.database.db.transaction((tx) =>
      rebuildIssueWordsJob.run(
        { tx, db: context.database.db, log: app.log, services: testServices() },
        {},
      ),
    );

    const queued = await context.database.db
      .select({ type: schema.jobs.type, payload: schema.jobs.payload })
      .from(schema.jobs);
    expect(queued).toHaveLength((await context.database.db.select().from(schema.projects)).length);
    expect(queued).toContainEqual({
      type: 'search.rebuildProjectWords',
      payload: { projectId: await projectId('API') },
    });
  });

  it('keep neither words too long to be typed, nor more than a few hundred of one issue', async () => {
    const api = await projectId('API');
    const madeUp = Array.from({ length: 400 }, (_, index) => `madeup${index}`);
    await report('API', {
      title: 'Swollen',
      description: [`a${'b'.repeat(300)}`, `c${'d'.repeat(32)}`, ...madeUp].join(' '),
    });

    const words = await wordsOf(api);
    expect(words.some((word) => word.length > 32)).toBe(false);
    expect(words.filter((word) => word.startsWith('madeup'))).toHaveLength(300 - 1);
    expect((await found('swolen')).length).toBe(1);
  });
});

describe('correcting a typo', () => {
  /** The titles of the issues `search` finds. */
  async function titlesFound(search: string, cookie: string): Promise<string[]> {
    const response = await call(
      'GET',
      `/api/v1/issues/search?${new URLSearchParams({ search })}`,
      cookie,
    );
    expect(response.statusCode).toBe(200);
    return issueSearchResponseSchema.parse(response.json()).rows.map(({ title }) => title);
  }

  it('reads only the projects one reads every issue of, so it tells nothing of the others', async () => {
    await report('WEB', { title: 'Decoy', description: 'marmalada' }, teamCookie);
    expect(await titlesFound('marmalade', teamCookie)).toStrictEqual(['Decoy']);

    // A word out of reach that starts with the one typed neither stops nor changes the correction.
    await report('API', { title: 'Confidential', description: 'marmalade' });
    expect(await titlesFound('marmalade', teamCookie)).toStrictEqual(['Decoy']);
    expect(await titlesFound('marmalada', adminCookie)).toStrictEqual(['Decoy']);
  });

  it('is left out for those who read their own issues only', async () => {
    expect(await found('crash', requesterCookie)).toStrictEqual(['WEB-2']);
    expect(await found('crasj', requesterCookie)).toStrictEqual([]);
    expect(await found('crasj', teamCookie)).toStrictEqual(['WEB-1', 'WEB-2']);
  });
});

describe('a search it cannot read', () => {
  it.each(['', 'search=', 'search=%20%20', `search=${'a'.repeat(101)}`])(
    'refuses %j',
    async (query) => {
      const response = await call('GET', `/api/v1/issues/search?${query}`, adminCookie);

      expect(response.statusCode).toBe(400);
      expect(apiErrorSchema.parse(response.json()).error.code).toBe('VALIDATION_FAILED');
    },
  );

  it('needs a session', async () => {
    expect((await call('GET', '/api/v1/issues/search?search=crash', '')).statusCode).toBe(401);
  });
});
