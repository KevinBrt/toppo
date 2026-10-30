import { fileURLToPath } from 'node:url';
import { schema } from '@toppo-tracker/db';
import type { SignatureCheck } from '@toppo-tracker/plugin-sdk';
import { signedHeaders } from '@toppo-tracker/plugin-sdk/host';
import { ROUTE_LIMITS } from '@toppo-tracker/plugin-sdk/protocol';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { strToU8 } from 'fflate';
import { rolldown } from 'rolldown';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nodeCrypto } from './platform/http/signatures/node-crypto.ts';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestPackageStore,
  packageSha256Of,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * A service outside Toppo calls a plugin's route: the plugin checks it signed the request, with
 * Toppo's cryptography, then acts as itself. Toppo bounds the rest: who may be called, what is
 * sent and answered, how often, and a route that fails never disables its plugin.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let issueId: string;
let issueKey: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';
const SECRETS = {
  githubSecret: 'gh-s3cret',
  gitlabToken: 'gl-t0ken',
  hooksSecret: 'whsec_c2VjcmV0',
};

/** The plugin of the tests, as its author's build would make it: SDK and Zod in, one script. */
async function bundle(): Promise<string> {
  const build = await rolldown({
    input: fileURLToPath(
      new URL('./platform/plugins/fixtures/commit-links.fixture.ts', import.meta.url),
    ),
    platform: 'neutral',
  });
  const { output } = await build.generate({ format: 'iife' });
  await build.close();
  return output[0].code;
}

/**
 * A plugin written straight to the protocol, whose routes answer what each is named after: what
 * reached it, a refusal, an error, a status no route answers, or too much.
 */
const ODD_RUN = `
  if (kind === 'settings') {
    return JSON.stringify({ ok: true, result: name === 'projects' ? [] : null });
  }
  const request = JSON.parse(payload);
  const answers = {
    'echo.receive': { ok: true, result: { status: 200, body: {
      headers: Object.keys(request.headers).sort(), query: request.query, body: request.body,
    } } },
    'refuse.receive': { ok: false, error: { code: 'errors.notOurs' } },
    'odd.receive': { ok: true, result: { status: 302 } },
    'large.receive': { ok: true, result: { status: 200, body: 'x'.repeat(${ROUTE_LIMITS.answerBytes}) } },
  };
  if (name === 'crash.receive') {
    throw new Error('boom');
  }
  return JSON.stringify(answers[name]);
`;

function call(method: 'GET' | 'POST' | 'PUT', url: string, body?: object) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie: adminCookie },
    ...(body ? { body } : {}),
  });
}

async function install(payload: Buffer, slug: string): Promise<void> {
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: adminCookie, 'content-type': 'application/zip' },
    payload,
  });
  expect(uploaded.statusCode, uploaded.body).toBe(201);
  const approved = await call('POST', `/api/v1/plugins/${slug}/approve`, {
    packageSha256: await packageSha256Of(context.database, slug),
    projects: ['WEB'],
  });
  expect(approved.statusCode, approved.body).toBe(204);
}

/** A request from outside Toppo to a route: no session, no origin, as a service sends it. */
function receive(
  route: string,
  {
    headers = {},
    body = '',
    slug = 'commit-links',
  }: { headers?: Record<string, string>; body?: string; slug?: string },
) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/plugins/${slug}/routes/${route}`,
    headers: { 'content-type': 'application/json', ...headers },
    payload: body,
  });
}

/** A commit whose message names the issue, signed as `check` says, under its delivery's id. */
function commit(
  check: SignatureCheck,
  delivery: Record<string, string> = {},
  timestamp = now(),
  message = `Fix the invoice download (${issueKey})`,
) {
  const body = JSON.stringify({ sha: '4f2a9c1e7b', message });
  return {
    body,
    headers: { ...signedHeaders(nodeCrypto, check, body, { id: 'msg_1', timestamp }), ...delivery },
  };
}

const now = () => Math.floor(Date.now() / 1000);

async function commentsOnIssue() {
  return await context.database.db
    .select({ body: schema.comments.body, author: schema.users.name })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.users.id, schema.comments.authorId))
    .where(eq(schema.comments.issueId, issueId))
    .orderBy(schema.comments.createdAt);
}

beforeAll(async () => {
  app = await buildTestApp({
    database: context.database,
    packages: await createTestPackageStore(),
  });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  adminCookie = cookieHeader(
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: ORIGIN },
      body: { email: 'ada@example.com', password: PASSWORD },
    }),
  );
  expect((await call('POST', '/api/v1/projects', { key: 'WEB', name: 'Website' })).statusCode).toBe(
    201,
  );
  const reported = await call('POST', '/api/v1/projects/WEB/issues', {
    title: 'Invoices fail to download',
  });
  ({ id: issueId, key: issueKey } = reported.json<{ id: string; key: string }>());

  await install(
    testPackage({
      files: {
        'server.js': strToU8(await bundle()),
        'plugin.json': strToU8(JSON.stringify({ version: '1.0.0' })),
      },
    }),
    'commit-links',
  );
  const saved = await call('PUT', '/api/v1/plugins/commit-links/settings', { values: SECRETS });
  expect(saved.statusCode, saved.body).toBe(204);
  await install(
    testPackage({
      manifest: testManifest({
        id: 'odd-hooks',
        needs: [],
        permissions: {},
        actions: [],
        events: [],
        routes: ['echo', 'refuse', 'odd', 'large', 'crash'].map((name) => ({
          name: `${name}.receive`,
        })),
      }),
      run: ODD_RUN,
    }),
    'odd-hooks',
  );
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await context.database.db.delete(schema.rateLimitCounters);
});

describe('a plugin’s route', () => {
  it('acts on a request GitHub signed, once per delivery, as the plugin itself', async () => {
    const github = commit(
      { scheme: 'github', secret: SECRETS.githubSecret },
      {
        'x-github-delivery': 'delivery-1',
      },
    );

    const received = await receive('github.push', github);
    expect(received.statusCode, received.body).toBe(202);
    expect(received.json()).toStrictEqual({ issueKey });
    // GitHub sends it again when it got no answer in time: one comment all the same.
    expect((await receive('github.push', github)).statusCode).toBe(202);

    expect(await commentsOnIssue()).toStrictEqual([
      { body: `Commit 4f2a9c1: Fix the invoice download (${issueKey})`, author: 'Commit links' },
    ]);
  });

  it('finds the issue a commit names by its key, among those the plugin sees only', async () => {
    const created = await call('POST', '/api/v1/projects', { key: 'OPS', name: 'Operations' });
    expect(created.statusCode).toBe(201);
    const reported = await call('POST', '/api/v1/projects/OPS/issues', { title: 'Backups fail' });
    const elsewhere = reported.json<{ key: string }>().key;
    const github = (delivery: string, message: string) =>
      commit(
        { scheme: 'github', secret: SECRETS.githubSecret },
        { 'x-github-delivery': delivery },
        now(),
        message,
      );

    for (const message of [`Fix the backups (${elsewhere})`, 'Fix a typo', 'Fix WEB-999']) {
      expect((await receive('github.push', github(message, message))).statusCode).toBe(404);
    }
    const lower = await receive(
      'github.push',
      github('lower', `Fix it, ${issueKey.toLowerCase()}`),
    );
    expect(lower.statusCode, lower.body).toBe(202);
    expect(lower.json()).toStrictEqual({ issueKey });
  });

  it('refuses a request signed with another secret, or not at all', async () => {
    const before = await commentsOnIssue();
    const forged = commit({ scheme: 'github', secret: 'guessed' }, { 'x-github-delivery': 'd-2' });

    expect((await receive('github.push', forged)).statusCode).toBe(401);
    expect((await receive('github.push', { body: forged.body })).statusCode).toBe(401);
    expect(
      (
        await receive('gitlab.push', {
          body: forged.body,
          headers: { 'x-gitlab-token': 'guessed' },
        })
      ).statusCode,
    ).toBe(401);
    expect(await commentsOnIssue()).toStrictEqual(before);
  });

  it('checks GitLab’s token and Standard Webhooks, the latter dated', async () => {
    const gitlab = commit(
      { scheme: 'token', header: 'x-gitlab-token', secret: SECRETS.gitlabToken },
      {
        'x-gitlab-event-uuid': 'gitlab-1',
      },
    );
    const standard = { scheme: 'standard-webhooks', secret: SECRETS.hooksSecret } as const;

    expect((await receive('gitlab.push', gitlab)).statusCode).toBe(202);
    expect((await receive('hooks.receive', commit(standard))).statusCode).toBe(202);
    // Caught on its way and sent again an hour later: refused.
    expect((await receive('hooks.receive', commit(standard, {}, now() - 3600))).statusCode).toBe(
      401,
    );
  });

  it('is shown with its address, for the administrator to give the service', async () => {
    const shown = await call('GET', '/api/v1/plugins/commit-links');

    expect(shown.json<{ routes: unknown }>().routes).toStrictEqual([
      {
        name: 'github.push',
        url: 'http://localhost:3000/api/v1/plugins/commit-links/routes/github.push',
      },
      {
        name: 'gitlab.push',
        url: 'http://localhost:3000/api/v1/plugins/commit-links/routes/gitlab.push',
      },
      {
        name: 'hooks.receive',
        url: 'http://localhost:3000/api/v1/plugins/commit-links/routes/hooks.receive',
      },
    ]);
  });

  it('hands the plugin the request as it came, never a cookie', async () => {
    const received = await app.inject({
      method: 'POST',
      url: '/api/v1/plugins/odd-hooks/routes/echo.receive?team=web&team=ops',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        cookie: adminCookie,
        'x-delivery': 'd-1',
      },
      payload: '  {"spaced": true}  ',
    });

    expect(received.statusCode, received.body).toBe(200);
    expect(received.json()).toStrictEqual({
      headers: ['content-length', 'content-type', 'host', 'user-agent', 'x-delivery'],
      query: { team: 'web, ops' },
      body: '  {"spaced": true}  ',
    });
  });

  it('answers what the plugin refuses, and 502 when it fails, without disabling it', async () => {
    const odd = (route: string) => receive(route, { slug: 'odd-hooks', body: '{}' });

    const refused = await odd('refuse.receive');
    expect(refused.statusCode).toBe(422);
    expect(refused.json()).toMatchObject({
      error: { code: 'PLUGIN_REFUSED', plugin: { code: 'errors.notOurs' } },
    });
    for (const route of ['crash.receive', 'odd.receive', 'large.receive']) {
      const failed = await odd(route);
      expect(failed.statusCode, route).toBe(502);
      expect(failed.json()).toStrictEqual({
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      });
    }
    const [plugin] = await context.database.db
      .select({ state: schema.plugins.state, failures: schema.plugins.failures })
      .from(schema.plugins)
      .where(eq(schema.plugins.slug, 'odd-hooks'));
    expect(plugin).toStrictEqual({ state: 'enabled', failures: 0 });
  });

  it('is found only on an enabled plugin that declares it', async () => {
    expect((await receive('pull.receive', {})).statusCode).toBe(404);
    expect((await receive('github.push', { slug: 'nobody' })).statusCode).toBe(404);
    expect((await call('POST', '/api/v1/plugins/odd-hooks/disable')).statusCode).toBe(204);
    const disabled = await receive('echo.receive', { slug: 'odd-hooks' });
    expect(disabled.statusCode).toBe(404);
    expect(disabled.json()).toMatchObject({ error: { code: 'PLUGIN_ROUTE_NOT_FOUND' } });
    expect((await call('POST', '/api/v1/plugins/odd-hooks/enable')).statusCode).toBe(204);
  });

  it('takes text only, of a bounded size, and so many requests a minute', async () => {
    const echo = (headers: Record<string, string>, body: string) =>
      receive('echo.receive', { slug: 'odd-hooks', headers, body });

    expect((await echo({ 'content-type': 'application/octet-stream' }, 'bytes')).statusCode).toBe(
      415,
    );
    expect((await echo({}, 'x'.repeat(ROUTE_LIMITS.bodyBytes + 1))).statusCode).toBe(413);
    expect(
      (await echo({ 'content-type': 'application/x-www-form-urlencoded' }, 'payload=%7B%7D'))
        .statusCode,
    ).toBe(200);

    // Whoever sends them, a plugin's routes take so many requests a minute.
    await context.database.db
      .update(schema.rateLimitCounters)
      .set({ count: ROUTE_LIMITS.perPluginPerMinute, expiresAt: sql`now() + interval '1 minute'` })
      .where(eq(schema.rateLimitCounters.key, 'plugin-routes:odd-hooks'));
    expect((await echo({}, '{}')).statusCode).toBe(429);
  });
});
