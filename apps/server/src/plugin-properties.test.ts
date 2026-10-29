import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import type { Manifest } from '@toppo-tracker/plugin-sdk/protocol';
import type { IssueFieldsResponse, PropertiesResponse } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testManifest, testPackage } from './platform/plugins/packages/test-package.ts';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  packageSha256Of,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from './test-helpers.ts';

/*
 * A plugin adds properties to issues, as it is approved: shown where it acts, written by people
 * as any property, or by the plugin alone, without activity. They stay while it is installed,
 * and go, or wait hidden, as it is uninstalled.
 */

const context = setupTestDatabase();
let app: FastifyInstance;
const cookies: Record<string, string> = {};

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

const words = (timeSpent: string, estimate: string, billable: string, name: string) => ({
  plugin: { name, description: name },
  permissions: { log: name },
  properties: { timeSpent, estimate, billable },
});

const MANIFEST = testManifest({
  needs: ['issue.read'],
  properties: {
    timeSpent: {
      name: 'properties.timeSpent',
      type: 'number',
      display: 'duration',
      writtenBy: 'plugin',
    },
    estimate: { name: 'properties.estimate', type: 'number', writtenBy: 'people' },
  },
  messages: {
    en: words('Time spent', 'Estimate', 'Billable', 'Time tracking'),
    fr: words('Temps passé', 'Estimation', 'Facturable', 'Suivi du temps'),
  },
  actions: [{ name: 'records.ask', access: 'authenticated', input: {} }],
  events: [],
});

/** Asks Toppo what the input says, as is: Toppo checks it all itself. */
const RUN = `
  const { method, args } = JSON.parse(payload);
  const answer = await __host
    .call(method, JSON.stringify(args))
    .then((answered) => ({ answer: JSON.parse(answered) }), (error) => ({ refused: error.message }));
  return JSON.stringify({ ok: true, result: answer });
`;

function call(who: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, body?: unknown) {
  const headers = { origin: ORIGIN, cookie: cookies[who] ?? '' };
  return app.inject(
    body === undefined
      ? { method, url, headers }
      : {
          method,
          url,
          headers: { ...headers, 'content-type': 'application/json' },
          payload: JSON.stringify(body),
        },
  );
}

/** What Toppo answers the plugin's call, run for `who`. */
async function asks(who: string, method: string, args: Record<string, unknown>) {
  const response = await call(who, 'POST', '/api/v1/plugins/time-tracking/actions/records.ask', {
    method,
    args,
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json<{ result: { answer?: unknown; refused?: string } }>().result;
}

async function signIn(who: string, email: string): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  cookies[who] = cookieHeader(response);
}

async function issueIn(projectKey: string): Promise<{ id: string; key: string }> {
  const created = await call('ada', 'POST', `/api/v1/projects/${projectKey}/issues`, {
    title: 'Invoices fail to download',
  });
  expect(created.statusCode, created.body).toBe(201);
  return created.json<{ id: string; key: string }>();
}

async function install(manifest: Manifest = MANIFEST, status = 201) {
  const uploaded = await app.inject({
    method: 'POST',
    url: '/api/v1/plugins',
    headers: { origin: ORIGIN, cookie: cookies['ada'] ?? '', 'content-type': 'application/zip' },
    payload: testPackage({ manifest, run: RUN }),
  });
  expect(uploaded.statusCode, uploaded.body).toBe(status);
  return uploaded;
}

async function approve(projects: 'all' | string[] = ['WEB'], status = 204) {
  const approved = await call('ada', 'POST', '/api/v1/plugins/time-tracking/approve', {
    packageSha256: await packageSha256Of(context.database, 'time-tracking'),
    projects,
  });
  expect(approved.statusCode, approved.body).toBe(status);
  return approved;
}

async function uninstall(data: 'keep' | 'delete') {
  const removed = await call('ada', 'DELETE', `/api/v1/plugins/time-tracking?data=${data}`);
  expect(removed.statusCode, removed.body).toBe(204);
}

/** The properties of the instance, as the settings list them. */
async function instanceProperties() {
  const listed = await call('ada', 'GET', '/api/v1/properties');
  expect(listed.statusCode, listed.body).toBe(200);
  return listed.json<PropertiesResponse>().properties;
}

/** The names of the properties a project's issues take. */
async function namesIn(projectKey: string): Promise<string[]> {
  const fields = await call('ada', 'GET', `/api/v1/projects/${projectKey}/issue-fields`);
  expect(fields.statusCode, fields.body).toBe(200);
  return fields.json<IssueFieldsResponse>().properties.map(({ name }) => name);
}

async function propertyNamed(name: string) {
  const found = (await instanceProperties()).find((property) => property.name === name);
  if (!found) {
    throw new Error(`No property is named ${name}`);
  }
  return found;
}

/** The changes of properties an issue's history tells. */
async function propertyChanges(issueId: string) {
  return await context.database.db
    .select({ payload: schema.activities.payload })
    .from(schema.activities)
    .where(
      and(
        eq(schema.activities.issueId, issueId),
        eq(schema.activities.type, 'issue.propertyChanged'),
      ),
    );
}

/** The plugin as it is first approved: gone with its data first, the instance's properties too. */
async function freshPlugin(): Promise<void> {
  const [installed] = await context.database.db
    .select({ id: schema.plugins.id })
    .from(schema.plugins)
    .where(eq(schema.plugins.slug, 'time-tracking'));
  if (installed) {
    await uninstall('delete');
  }
  await context.database.db.delete(schema.properties).where(isNull(schema.properties.projectId));
  await context.database.db.delete(schema.rateLimitCounters);
  await install();
  await approve();
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
  await signIn('ada', 'ada@example.com');
  for (const [key, name] of [
    ['WEB', 'Website'],
    ['OPS', 'Operations'],
  ] as const) {
    const created = await call('ada', 'POST', '/api/v1/projects', { key, name });
    expect(created.statusCode).toBe(201);
  }
  // Grace works in WEB only, with the team role.
  const grace = await createTestUser(context.database, {
    name: 'Grace Hopper',
    email: 'grace@example.com',
    password: PASSWORD,
    instanceRoleId: DEFAULT_ROLE_IDS.team,
  });
  await signIn('grace', 'grace@example.com');
  const joined = await call('ada', 'POST', '/api/v1/projects/WEB/members', {
    userIds: [grace],
    roleId: null,
  });
  expect(joined.statusCode, joined.body).toBe(204);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await freshPlugin();
});

describe('the properties a plugin adds', () => {
  it('are added as it is approved, named in the approver’s language, its name after one taken', async () => {
    await uninstall('delete');
    expect(
      (
        await call('ada', 'POST', '/api/v1/properties', {
          name: 'Estimation',
          type: 'text',
          shownInList: false,
          askedAtCreation: false,
          required: false,
        })
      ).statusCode,
    ).toBe(201);
    await context.database.db
      .update(schema.users)
      .set({ locale: 'fr' })
      .where(eq(schema.users.email, 'ada@example.com'));

    try {
      await install();
      await approve();
    } finally {
      await context.database.db
        .update(schema.users)
        .set({ locale: 'en' })
        .where(eq(schema.users.email, 'ada@example.com'));
    }

    const plugin = {
      slug: 'time-tracking',
      name: { en: 'Time tracking', fr: 'Suivi du temps' },
      installed: true,
    };
    expect(await instanceProperties()).toMatchObject([
      { name: 'Estimation', plugin: null, writtenBy: 'people' },
      {
        name: 'Temps passé',
        type: 'number',
        writtenBy: 'plugin',
        display: 'duration',
        plugin,
      },
      { name: 'Estimation (Suivi du temps)', writtenBy: 'people', display: null, plugin },
    ]);
    const details = await call('ada', 'GET', '/api/v1/plugins/time-tracking');
    expect(details.json()).toMatchObject({
      properties: [
        {
          name: { en: 'Time spent', fr: 'Temps passé' },
          type: 'number',
          writtenBy: 'plugin',
          display: 'duration',
        },
        { name: { en: 'Estimate', fr: 'Estimation' }, writtenBy: 'people', display: null },
      ],
    });
  });

  it('show in the projects the plugin acts in, while it is enabled', async () => {
    expect(await namesIn('WEB')).toStrictEqual(['Time spent', 'Estimate']);
    expect(await namesIn('OPS')).toStrictEqual([]);

    expect((await call('ada', 'POST', '/api/v1/plugins/time-tracking/disable')).statusCode).toBe(
      204,
    );
    expect(await namesIn('WEB')).toStrictEqual([]);
    await approve('all');
    expect(await namesIn('OPS')).toStrictEqual(['Time spent', 'Estimate']);
  });

  it('are written by the plugin alone when it says so, without activity, and read by it', async () => {
    const issue = await issueIn('WEB');
    const { id: spentId } = await propertyNamed('Time spent');
    const { id: estimateId } = await propertyNamed('Estimate');

    expect(
      await asks('ada', 'issues.setProperty', {
        issueId: issue.id,
        property: 'timeSpent',
        value: 90,
      }),
    ).toStrictEqual({ answer: null });
    const typedIn = await call(
      'ada',
      'PUT',
      `/api/v1/issues/${issue.key}/properties/${estimateId}`,
      {
        value: 120,
      },
    );
    expect(typedIn.statusCode, typedIn.body).toBe(204);

    expect(await asks('ada', 'issues.get', { issueId: issue.id })).toMatchObject({
      answer: { properties: { timeSpent: 90, estimate: 120 } },
    });
    const read = await call('ada', 'GET', `/api/v1/issues/${issue.key}`);
    expect(read.json()).toMatchObject({
      properties: [
        { name: 'Time spent', type: 'number', value: 90 },
        { name: 'Estimate', type: 'number', value: 120 },
      ],
    });
    // Only what people typed in is in its history.
    expect(await propertyChanges(issue.id)).toStrictEqual([
      { payload: expect.objectContaining({ property: { id: estimateId, name: 'Estimate' } }) },
    ]);

    expect(
      (
        await call('ada', 'PUT', `/api/v1/issues/${issue.key}/properties/${spentId}`, { value: 1 })
      ).json(),
    ).toMatchObject({ error: { code: 'PROPERTY_WRITTEN_BY_PLUGIN' } });
    expect(
      await asks('ada', 'issues.setProperty', {
        issueId: issue.id,
        property: 'estimate',
        value: 60,
      }),
    ).toStrictEqual({ refused: 'PROPERTY_NOT_FOUND' });
    expect(
      await asks('ada', 'issues.setProperty', {
        issueId: issue.id,
        property: 'timeSpent',
        value: 'many',
      }),
    ).toStrictEqual({ refused: 'INVALID_PROPERTY_VALUE' });
    expect(
      await asks('ada', 'issues.setProperty', {
        issueId: issue.id,
        property: 'timeSpent',
        value: null,
      }),
    ).toStrictEqual({ answer: null });
    expect(await asks('ada', 'issues.get', { issueId: issue.id })).toMatchObject({
      answer: { properties: { estimate: 120 } },
    });
  });

  it('are written on the issues the plugin, and whoever it acts for, sees only', async () => {
    const elsewhere = await issueIn('OPS');
    await approve('all');
    const hidden = await issueIn('OPS');
    await approve();

    expect(
      await asks('ada', 'issues.setProperty', {
        issueId: elsewhere.id,
        property: 'timeSpent',
        value: 5,
      }),
    ).toStrictEqual({ refused: 'PROJECT_NOT_FOUND' });
    await approve('all');
    // Grace works in WEB only.
    expect(
      await asks('grace', 'issues.setProperty', {
        issueId: hidden.id,
        property: 'timeSpent',
        value: 5,
      }),
    ).toStrictEqual({ refused: 'PROJECT_NOT_FOUND' });
  });

  it('stay with their plugin: never deleted while it is installed, nor asked of anyone', async () => {
    const spent = await propertyNamed('Time spent');

    expect((await call('ada', 'DELETE', `/api/v1/properties/${spent.id}`)).json()).toMatchObject({
      error: { code: 'PROPERTY_OF_PLUGIN' },
    });
    const asked = await call('ada', 'PUT', `/api/v1/properties/${spent.id}`, {
      name: 'Time spent',
      shownInList: true,
      askedAtCreation: true,
      required: false,
      options: [],
      removed: [],
    });
    expect(asked.json()).toMatchObject({ error: { code: 'PROPERTY_WRITTEN_BY_PLUGIN' } });
    const renamed = await call('ada', 'PUT', `/api/v1/properties/${spent.id}`, {
      name: 'Spent',
      shownInList: true,
      askedAtCreation: false,
      required: false,
      options: [],
      removed: [],
    });
    expect(renamed.statusCode, renamed.body).toBe(204);
    expect(await propertyNamed('Spent')).toMatchObject({ shownInList: true });
    const created = await call('ada', 'POST', '/api/v1/projects/WEB/issues', {
      title: 'Slow export',
      properties: { [spent.id]: 30 },
    });
    expect(created.json()).toMatchObject({ error: { code: 'PROPERTY_WRITTEN_BY_PLUGIN' } });
  });

  it('follow its versions: one more waits for approval, one dropped waits hidden, a type stays', async () => {
    const issue = await issueIn('WEB');
    const { id: estimateId } = await propertyNamed('Estimate');
    await call('ada', 'PUT', `/api/v1/issues/${issue.key}/properties/${estimateId}`, { value: 60 });
    const { estimate: _, ...rest } = MANIFEST.properties;

    await install({
      ...MANIFEST,
      properties: {
        ...MANIFEST.properties,
        billable: { name: 'properties.billable', type: 'checkbox', writtenBy: 'plugin' },
      },
    });
    expect((await call('ada', 'GET', '/api/v1/plugins/time-tracking')).json()).toMatchObject({
      state: 'pending',
    });
    await approve();
    expect(await namesIn('WEB')).toStrictEqual(['Time spent', 'Estimate', 'Billable']);

    await install({ ...MANIFEST, properties: rest });
    expect(await namesIn('WEB')).toStrictEqual(['Time spent']);
    const changed = await install(
      {
        ...MANIFEST,
        properties: {
          ...rest,
          estimate: { name: 'properties.estimate', type: 'text', writtenBy: 'people' },
        },
      },
      400,
    );
    expect(changed.json()).toMatchObject({ error: { code: 'PLUGIN_PROPERTY_CHANGED' } });

    // Declared again, the estimate is asked for again: found with its values once approved.
    await install();
    expect(await namesIn('WEB')).toStrictEqual([]);
    await approve();
    expect(await namesIn('WEB')).toStrictEqual(['Time spent', 'Estimate']);
    expect(await asks('ada', 'issues.get', { issueId: issue.id })).toMatchObject({
      answer: { properties: { estimate: 60 } },
    });
  });

  it('count among the instance’s, its approval refused past them', async () => {
    await uninstall('delete');
    for (let at = 0; at < 19; at++) {
      const created = await call('ada', 'POST', '/api/v1/properties', {
        name: `Field ${at}`,
        type: 'text',
        shownInList: false,
        askedAtCreation: false,
        required: false,
      });
      expect(created.statusCode, created.body).toBe(201);
    }
    await install();

    expect((await approve(['WEB'], 409)).json()).toMatchObject({
      error: { code: 'PROPERTY_LIMIT_REACHED' },
    });
  });

  it('wait hidden when the plugin is uninstalled keeping its data, and come back with it', async () => {
    const issue = await issueIn('WEB');
    await asks('ada', 'issues.setProperty', {
      issueId: issue.id,
      property: 'timeSpent',
      value: 45,
    });

    await uninstall('keep');
    expect(await namesIn('WEB')).toStrictEqual([]);
    expect(await propertyNamed('Time spent')).toMatchObject({ plugin: { installed: false } });
    expect((await call('ada', 'GET', `/api/v1/issues/${issue.key}`)).json()).toMatchObject({
      properties: [],
    });

    await install();
    await approve();
    expect(await namesIn('WEB')).toStrictEqual(['Time spent', 'Estimate']);
    expect(await asks('ada', 'issues.get', { issueId: issue.id })).toMatchObject({
      answer: { properties: { timeSpent: 45 } },
    });
  });

  it('go with the plugin’s data, what people typed in told in each issue’s history', async () => {
    const issue = await issueIn('WEB');
    const { id: estimateId } = await propertyNamed('Estimate');
    await asks('ada', 'issues.setProperty', {
      issueId: issue.id,
      property: 'timeSpent',
      value: 45,
    });
    await call('ada', 'PUT', `/api/v1/issues/${issue.key}/properties/${estimateId}`, { value: 60 });

    await uninstall('delete');

    expect(await instanceProperties()).toStrictEqual([]);
    const [kept] = await context.database.db
      .select({ properties: schema.issues.properties })
      .from(schema.issues)
      .where(eq(schema.issues.id, issue.id));
    expect(kept?.properties).toStrictEqual({});
    expect((await propertyChanges(issue.id)).map(({ payload }) => payload)).toStrictEqual([
      expect.objectContaining({ from: null, to: 60 }),
      expect.objectContaining({ from: 60, to: null }),
    ]);
  });
});
