import {
  defineEntity,
  definePlugin,
  defineProperty,
  HttpFailure,
  type HttpReach,
  secret,
  z,
} from '@toppo-tracker/plugin-sdk';
import { describe, expect, it } from 'vitest';
import { signed } from './test-signatures.ts';
import { createTestToppo, PluginRunError } from './test-toppo.ts';

/** A plugin as an author writes one, defined anew for each test. */
function timeTracking(
  needs: readonly ('issue.read' | 'comment.create')[] = ['issue.read', 'comment.create'],
) {
  const plugin = definePlugin({
    id: 'time-tracking',
    name: 'closed',
    description: 'closed',
    apiVersion: '^1.0',
    needs,
    permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
    settings: z.object({ maxMinutesPerDay: z.int().min(1).default(600) }),
    projectSettings: z.object({ budgetDays: z.number().positive().optional() }),
    messages: {
      en: {
        permissions: { log: 'Log time' },
        settings: { maxMinutesPerDay: { label: 'Minutes a day' } },
        projectSettings: { budgetDays: { label: 'Budget, in days' } },
        errors: { dailyLimit: 'At most {limit}.' },
        closed: 'Closed.',
      },
      fr: {
        permissions: { log: 'Saisir' },
        settings: { maxMinutesPerDay: { label: 'Minutes par jour' } },
        projectSettings: { budgetDays: { label: 'Budget, en jours' } },
        errors: { dailyLimit: '{limit} au plus.' },
        closed: 'Fermé.',
      },
    },
  });
  const logTime = plugin.defineAction({
    name: 'timeEntry.log',
    access: { issue: 'issueId', permission: 'entries.log' },
    input: z.object({ issueId: z.uuid(), minutes: z.int().min(1) }),
    async handler(ctx, input) {
      if (input.minutes > ctx.settings.maxMinutesPerDay) {
        throw ctx.fail('errors.dailyLimit', { limit: ctx.settings.maxMinutesPerDay });
      }
      const issue = await ctx.issues.get(input.issueId);
      return { key: issue?.key, user: ctx.user.id };
    },
  });
  const ask = plugin.defineAction({
    name: 'issue.peek',
    access: 'authenticated',
    input: z.object({ issueId: z.uuid() }),
    async handler(ctx, { issueId }) {
      return (await ctx.issues.get(issueId))?.key ?? null;
    },
  });
  const find = plugin.defineAction({
    name: 'issue.find',
    access: 'authenticated',
    input: z.object({ key: z.string() }),
    async handler(ctx, { key }) {
      return (await ctx.issues.find(key))?.id ?? null;
    },
  });
  plugin.defineEventHandler({
    event: 'issue.statusChanged',
    async handler(ctx, { event, issue }) {
      if (issue.closedAt !== null) {
        await ctx.issues.comment(issue.id, ctx.t('closed'), { once: event.id });
        await ctx.issues.comment(issue.id, ctx.t('closed'), { once: event.id });
      }
    },
  });
  const budget = plugin.defineAction({
    name: 'project.budget',
    access: 'authenticated',
    input: z.object({ projectId: z.uuid() }),
    async handler(ctx, { projectId }) {
      return (await ctx.projects.settings(projectId)).budgetDays ?? null;
    },
  });
  return { plugin, logTime, ask, find, budget };
}

/** The project of the issues the kit makes. */
const WEB = '00000000-0000-4000-8000-000000000100';

describe('a fake Toppo for a plugin’s tests', () => {
  it('reads what a project set for itself, for someone who reaches it by an issue', async () => {
    const { plugin, budget } = timeTracking();
    const toppo = createTestToppo(plugin, { projectSettings: { [WEB]: { budgetDays: 20 } } });
    const issue = toppo.createIssue();

    expect(await toppo.createUser({ sees: [issue] }).run(budget, { projectId: WEB })).toBe(20);
    await expect(
      toppo.createUser({ sees: [] }).run(budget, { projectId: WEB }),
    ).rejects.toMatchObject({ code: 'PLUGIN_ERROR', detail: 'NOT_FOUND' });
    await expect(
      toppo.createUser().run(budget, { projectId: '00000000-0000-4000-8000-000000000999' }),
    ).rejects.toMatchObject({ code: 'PLUGIN_ERROR', detail: 'NOT_FOUND' });
  });

  it('runs an action for someone who reaches the issue and holds the permission', async () => {
    const { plugin, logTime } = timeTracking();
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue({ title: 'Invoices fail to download' });
    const ada = toppo.createUser({ sees: [issue], permissions: ['entries.log'] });

    expect(await ada.run(logTime, { issueId: issue.id, minutes: 30 })).toStrictEqual({
      key: 'WEB-1',
      user: ada.id,
    });
    expect(toppo.manifest).toMatchObject({
      id: 'time-tracking',
      actions: [
        { name: 'timeEntry.log' },
        { name: 'issue.peek' },
        { name: 'issue.find' },
        { name: 'project.budget' },
      ],
    });
  });

  it('answers 404 to someone who does not see the issue, 403 to someone without the permission', async () => {
    const { plugin, logTime } = timeTracking();
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();

    await expect(
      toppo
        .createUser({ sees: [], permissions: ['entries.log'] })
        .run(logTime, { issueId: issue.id, minutes: 5 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      toppo.createUser().run(logTime, { issueId: issue.id, minutes: 5 }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('hides from the plugin the issues its user does not see', async () => {
    const { plugin, ask } = timeTracking();
    const toppo = createTestToppo(plugin);
    const seen = toppo.createIssue();
    const hidden = toppo.createIssue();
    const ada = toppo.createUser({ sees: [seen] });

    expect(await ada.run(ask, { issueId: seen.id })).toBe(seen.key);
    expect(await ada.run(ask, { issueId: hidden.id })).toBeNull();
  });

  it('finds an issue by its key, as people write it, among those its user sees', async () => {
    const { plugin, find } = timeTracking();
    const toppo = createTestToppo(plugin);
    const seen = toppo.createIssue();
    const hidden = toppo.createIssue();
    const ada = toppo.createUser({ sees: [seen] });

    expect(await ada.run(find, { key: seen.key })).toBe(seen.id);
    expect(await ada.run(find, { key: ` ${seen.key.toLowerCase()} ` })).toBe(seen.id);
    for (const key of [hidden.key, 'WEB-99', 'not a key']) {
      expect(await ada.run(find, { key })).toBeNull();
    }
  });

  it('refuses the plugin a call its needs do not allow', async () => {
    // It reads issues, and comments on those closed without asking to.
    const { plugin } = timeTracking(['issue.read']);
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue({ closedAt: '2026-01-02T09:00:00.000Z' });

    const refused = toppo.emit('issue.statusChanged', {
      issue,
      change: { from: issue.status, to: issue.status },
    });

    await expect(refused).rejects.toBeInstanceOf(PluginRunError);
    await expect(refused).rejects.toMatchObject({ code: 'PLUGIN_ERROR', detail: 'FORBIDDEN' });
    expect(toppo.comments).toStrictEqual([]);
  });

  it('refuses, as Toppo would, a plugin acting on issues it does not read', () => {
    const { plugin } = timeTracking(['comment.create']);

    expect(() => createTestToppo(plugin)).toThrow(
      'timeEntry.log acts on an issue: the plugin needs issue.read',
    );
  });

  it('refuses in the plugin’s words, with the settings given', async () => {
    const { plugin, logTime } = timeTracking();
    const toppo = createTestToppo(plugin, { settings: { maxMinutesPerDay: 60 } });
    const issue = toppo.createIssue();

    await expect(
      toppo
        .createUser({ permissions: ['entries.log'] })
        .run(logTime, { issueId: issue.id, minutes: 90 }),
    ).rejects.toMatchObject({ code: 'errors.dailyLimit', params: { limit: 60 } });
    await expect(
      toppo
        .createUser({ permissions: ['entries.log'] })
        .run(logTime, { issueId: issue.id, minutes: 0 }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', issues: [{ path: 'minutes' }] });
  });

  it('tells the plugin of an event, which comments once, in the instance’s language', async () => {
    const { plugin } = timeTracking();
    const toppo = createTestToppo(plugin, { locale: 'fr' });
    const issue = toppo.createIssue({
      status: { id: '00000000-0000-4000-8000-000000000202', name: 'Done', closes: true },
      closedAt: '2026-01-02T09:00:00.000Z',
    });

    await toppo.emit('issue.statusChanged', {
      issue,
      change: {
        from: { id: issue.status.id, name: 'Open' },
        to: { id: issue.status.id, name: 'Done' },
      },
    });

    expect(toppo.comments).toMatchObject([{ issueId: issue.id, body: 'Fermé.' }]);
  });

  it('answers 404 to a comment on an issue that is not there', async () => {
    const { plugin } = timeTracking();
    const toppo = createTestToppo(plugin);
    const gone = { ...createTestToppo(plugin).createIssue(), closedAt: '2026-01-02T09:00:00.000Z' };

    await expect(
      toppo.emit('issue.statusChanged', {
        issue: gone,
        change: { from: gone.status, to: gone.status },
      }),
    ).rejects.toMatchObject({ code: 'PLUGIN_ERROR', detail: 'NOT_FOUND' });
    expect(toppo.comments).toStrictEqual([]);
  });

  it('keeps the properties the plugin writes on issues it sees, checked against their types', async () => {
    const words = { name: 'Time', spent: 'Time spent', guess: 'Estimate', billed: 'Billed' };
    const plugin = definePlugin({
      id: 'time-tracking',
      name: 'name',
      description: 'name',
      apiVersion: '^1.0',
      needs: ['issue.read'],
      properties: {
        timeSpent: defineProperty({ name: 'spent', type: 'number', writtenBy: 'plugin' }),
        estimate: defineProperty({ name: 'guess', type: 'number', writtenBy: 'people' }),
        billed: defineProperty({ name: 'billed', type: 'checkbox', writtenBy: 'plugin' }),
      },
      messages: { en: words, fr: words },
    });
    const spend = plugin.defineAction({
      name: 'time.spend',
      access: 'authenticated',
      input: z.object({ issueId: z.uuid(), minutes: z.unknown() }),
      async handler(ctx, { issueId, minutes }) {
        await ctx.issues.setProperty(issueId, 'timeSpent', minutes as number);
        await ctx.issues.setProperty(issueId, 'billed', minutes !== null);
        return (await ctx.issues.get(issueId))?.properties ?? null;
      },
    });
    const guess = plugin.defineAction({
      name: 'time.guess',
      access: 'authenticated',
      input: z.object({ issueId: z.uuid() }),
      async handler(ctx, { issueId }) {
        // People write the estimate: the plugin only reads it.
        await Reflect.apply(ctx.issues.setProperty, ctx.issues, [issueId, 'estimate', 1]);
      },
    });
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue({ properties: { estimate: 120 } });
    const elsewhere = toppo.createIssue();
    const someone = toppo.createUser({ sees: [issue] });

    expect(await someone.run(spend, { issueId: issue.id, minutes: 90 })).toStrictEqual({
      estimate: 120,
      timeSpent: 90,
      billed: true,
    });
    await someone.run(spend, { issueId: issue.id, minutes: null });
    expect(toppo.properties(issue.id)).toStrictEqual({ estimate: 120 });
    await expect(someone.run(spend, { issueId: issue.id, minutes: 'many' })).rejects.toMatchObject({
      code: 'PLUGIN_ERROR',
      detail: 'INVALID_PROPERTY_VALUE',
    });
    await expect(someone.run(spend, { issueId: elsewhere.id, minutes: 5 })).rejects.toMatchObject({
      code: 'PLUGIN_ERROR',
      detail: 'NOT_FOUND',
    });
    await expect(someone.run(guess, { issueId: issue.id })).rejects.toMatchObject({
      code: 'PLUGIN_ERROR',
      detail: 'PROPERTY_NOT_FOUND',
    });
  });

  it('keeps records on a person: on the one an action runs for, on anyone for an event', async () => {
    const words = { name: 'Boosters' };
    const plugin = definePlugin({
      id: 'boosters',
      name: 'name',
      description: 'name',
      apiVersion: '^1.1',
      needs: ['issue.read'],
      entities: {
        booster: defineEntity({
          attachedTo: 'person',
          fields: z.object({ pack: z.string().max(20) }),
        }),
      },
      messages: { en: words, fr: words },
    });
    plugin.defineEventHandler({
      event: 'issue.statusChanged',
      async handler(ctx, { event }) {
        await ctx.entities.booster.create({ personId: event.actorId, pack: 'starter' });
      },
    });
    const give = plugin.defineAction({
      name: 'booster.give',
      access: 'authenticated',
      input: z.object({ personId: z.uuid() }),
      async handler(ctx, { personId }) {
        return (await ctx.entities.booster.create({ personId, pack: 'gift' })).personId;
      },
    });
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();
    const ada = toppo.createUser();
    const grace = toppo.createUser({ sees: [] });

    await toppo.emit('issue.statusChanged', {
      issue,
      change: { from: issue.status, to: issue.status },
    });
    await toppo.emit('issue.statusChanged', {
      issue,
      change: { from: issue.status, to: issue.status },
      actorId: ada.id,
    });

    expect(await ada.run(give, { personId: ada.id })).toBe(ada.id);
    await expect(ada.run(give, { personId: grace.id })).rejects.toMatchObject({
      detail: 'FORBIDDEN',
    });
    await expect(grace.run(give, { personId: grace.id })).rejects.toMatchObject({
      detail: 'PERSON_NOT_FOUND',
    });
    expect(toppo.records('booster').map(({ personId }) => personId)).toStrictEqual([
      issue.reporterId,
      ada.id,
      ada.id,
    ]);
  });

  it('tells the plugin who holds its permissions, as the test gave them', async () => {
    const words = { name: 'Boosters', earn: 'Earn boosters', view: 'See collections' };
    const plugin = definePlugin({
      id: 'boosters',
      name: 'name',
      description: 'name',
      apiVersion: '^1.1',
      needs: ['issue.read'],
      permissions: {
        'boosters.earn': { scope: 'project', label: 'earn' },
        'collection.view': { scope: 'instance', label: 'view' },
      },
      entities: {
        booster: defineEntity({ attachedTo: 'person', fields: z.object({}) }),
      },
      messages: { en: words, fr: words },
    });
    plugin.defineEventHandler({
      event: 'issue.statusChanged',
      async handler(ctx, { event, issue }) {
        if (await ctx.people.can(event.actorId, 'boosters.earn', { projectId: issue.projectId })) {
          await ctx.entities.booster.create({ personId: event.actorId });
        }
      },
    });
    const ask = plugin.defineAction({
      name: 'people.ask',
      access: 'authenticated',
      input: z.object({ personId: z.uuid(), projectId: z.uuid().optional() }),
      async handler(ctx, { personId, projectId }) {
        return projectId === undefined
          ? await ctx.people.can(personId, 'collection.view')
          : await ctx.people.can(personId, 'boosters.earn', { projectId });
      },
    });
    const toppo = createTestToppo(plugin);
    const issue = toppo.createIssue();
    const elsewhere = toppo.createIssue({ projectId: '00000000-0000-4000-8000-000000000200' });
    const ada = toppo.createUser({
      sees: [issue],
      permissions: ['boosters.earn', 'collection.view'],
    });
    const grace = toppo.createUser({ sees: [issue] });
    const moved = (actorId: string) =>
      toppo.emit('issue.statusChanged', {
        issue,
        change: { from: issue.status, to: issue.status },
        actorId,
      });

    await moved(ada.id);
    await moved(grace.id);

    expect(toppo.records('booster').map(({ personId }) => personId)).toStrictEqual([ada.id]);
    expect(await ada.run(ask, { personId: ada.id })).toBe(true);
    expect(await ada.run(ask, { personId: ada.id, projectId: issue.projectId })).toBe(true);
    expect(await grace.run(ask, { personId: grace.id })).toBe(false);
    for (const [who, input, refused] of [
      [grace, { personId: ada.id }, 'FORBIDDEN'],
      [ada, { personId: ada.id, projectId: elsewhere.projectId }, 'PROJECT_NOT_FOUND'],
      [
        ada,
        { personId: ada.id, projectId: '00000000-0000-4000-8000-000000000999' },
        'PROJECT_NOT_FOUND',
      ],
    ] as const) {
      await expect(who.run(ask, input)).rejects.toMatchObject({ detail: refused });
    }
  });

  it('refuses to tell of a permission that is not the plugin’s, or of another scope', async () => {
    const words = { name: 'Boosters', earn: 'Earn boosters' };
    const plugin = definePlugin({
      id: 'boosters',
      name: 'name',
      description: 'name',
      apiVersion: '^1.1',
      permissions: { 'boosters.earn': { scope: 'project', label: 'earn' } },
      messages: { en: words, fr: words },
    });
    const ask = plugin.defineAction({
      name: 'people.ask',
      access: 'authenticated',
      input: z.object({ permission: z.string() }),
      async handler(ctx, { permission }) {
        return await Reflect.apply(ctx.people.can, ctx.people, [ctx.user.id, permission]);
      },
    });
    const toppo = createTestToppo(plugin);
    const ada = toppo.createUser();

    await expect(ada.run(ask, { permission: 'issue.read' })).rejects.toMatchObject({
      detail: 'PERMISSION_NOT_FOUND',
    });
    await expect(ada.run(ask, { permission: 'boosters.earn' })).rejects.toMatchObject({
      detail: 'PERMISSION_SCOPE',
    });
  });

  it('refuses a plugin for another API', () => {
    const plugin = definePlugin({
      id: 'from-the-future',
      name: 'name',
      description: 'name',
      apiVersion: '^2.0',
      messages: { en: { name: 'From the future' }, fr: { name: 'Du futur' } },
    });

    expect(() => createTestToppo(plugin)).toThrow('asks for API ^2.0');
  });
});

/** A plugin that tells a chat, at the address in its settings or where it says. */
function notifier(http?: HttpReach<z.ZodObject<{ chatUrl: z.ZodOptional<z.ZodURL> }>>) {
  const words = {
    name: 'Notifier',
    settings: { chatUrl: { label: 'Chat' } },
    jobs: { tell: 'Tell' },
  };
  const plugin = definePlugin({
    id: 'notifier',
    name: 'name',
    description: 'name',
    apiVersion: '^1.0',
    settings: z.object({ chatUrl: secret(z.url()).optional() }),
    ...(http === undefined ? {} : { http }),
    messages: { en: words, fr: words },
  });
  const tell = plugin.defineJob({
    name: 'tell',
    every: 'week',
    label: 'jobs.tell',
    async handler(ctx) {
      if (ctx.settings.chatUrl !== undefined) {
        await ctx.http.fetch(ctx.settings.chatUrl, { method: 'POST', body: 'Week 44' });
      }
    },
  });
  const ping = plugin.defineAction({
    name: 'chat.ping',
    access: 'authenticated',
    input: z.object({ url: z.string() }),
    async handler(ctx, { url }) {
      try {
        return (await ctx.http.fetch(url)).status;
      } catch (error) {
        return error instanceof HttpFailure ? error.code : 'not an HttpFailure';
      }
    },
  });
  return { plugin, tell, ping };
}

const CHAT = 'https://chat.example.com/hooks/T0';

describe('the world outside a fake Toppo', () => {
  it('hears a job’s requests, sent where its settings say, as the test answers them', async () => {
    const { plugin, tell } = notifier({ fromSettings: ['chatUrl'] });
    const toppo = createTestToppo(plugin, {
      settings: { chatUrl: CHAT },
      http: () => ({ status: 204 }),
    });

    await toppo.runJob(tell);

    expect(toppo.requests).toStrictEqual([
      { url: CHAT, method: 'POST', headers: {}, body: 'Week 44' },
    ]);
  });

  it('refuses what the plugin did not declare, and answers nothing unless the test does', async () => {
    const pings = async (
      http: Parameters<typeof notifier>[0],
      answer?: () => 'TIMEOUT' | { status: number },
    ) => {
      const { plugin, ping } = notifier(http);
      const someone = createTestToppo(plugin, {
        settings: { chatUrl: CHAT },
        ...(answer ? { http: answer } : {}),
      }).createUser();
      return await Promise.all(
        [CHAT, 'https://elsewhere.example.com/', 'ftp://chat.example.com/'].map((url) =>
          someone.run(ping, { url }),
        ),
      );
    };

    expect(await pings(undefined)).toStrictEqual([
      'HOST_NOT_DECLARED',
      'HOST_NOT_DECLARED',
      'ADDRESS_NOT_ALLOWED',
    ]);
    expect(await pings(['chat.example.com'])).toStrictEqual([
      'NETWORK_ERROR',
      'HOST_NOT_DECLARED',
      'ADDRESS_NOT_ALLOWED',
    ]);
    expect(await pings('any', () => 'TIMEOUT')).toStrictEqual([
      'TIMEOUT',
      'TIMEOUT',
      'ADDRESS_NOT_ALLOWED',
    ]);
    expect(await pings({ fromSettings: ['chatUrl'] }, () => ({ status: 201 }))).toStrictEqual([
      201,
      'HOST_NOT_DECLARED',
      'ADDRESS_NOT_ALLOWED',
    ]);
  });
});

/** A plugin that comments on the issue a service names, once it checked the service signed it. */
function linker() {
  const plugin = definePlugin({
    id: 'commit-links',
    name: 'name',
    description: 'name',
    apiVersion: '^1.0',
    needs: ['issue.read', 'comment.create'],
    settings: z.object({ secret: secret(z.string()).optional() }),
    messages: {
      en: { name: 'Commit links', settings: { secret: { label: 'Secret' } }, linked: 'Linked.' },
      fr: { name: 'Commit links', settings: { secret: { label: 'Secret' } }, linked: 'Lié.' },
    },
  });
  const route = plugin.defineRoute({
    name: 'push.receive',
    async handler(ctx, request) {
      const { secret: key } = ctx.settings;
      if (!(key && (await ctx.crypto.verify(request, { scheme: 'github', secret: key })))) {
        return { status: 401 };
      }
      const { issueId } = z.object({ issueId: z.uuid() }).parse(request.json());
      await ctx.issues.comment(issueId, ctx.t('linked'), {
        once: request.headers['x-github-delivery'] ?? issueId,
      });
      return { status: request.query['quiet'] ? 204 : 202, body: { issueId } };
    },
  });
  const odd = plugin.defineRoute({
    name: 'odd.receive',
    handler: () => Promise.resolve({ status: 302 as 202 }),
  });
  return { plugin, route, odd };
}

describe('the routes of a plugin, in a fake Toppo', () => {
  it('receives a request a service signed, as the plugin itself', async () => {
    const { plugin, route } = linker();
    const toppo = createTestToppo(plugin, { settings: { secret: 's3cret' } });
    const issue = toppo.createIssue();
    const request = signed({ scheme: 'github', secret: 's3cret' }, { issueId: issue.id });

    expect(
      await toppo.receive(route, {
        ...request,
        headers: { ...request.headers, 'X-GitHub-Delivery': 'd-1' },
      }),
    ).toStrictEqual({ status: 202, body: { issueId: issue.id } });
    expect(await toppo.receive(route, { ...request, query: { quiet: '1' } })).toStrictEqual({
      status: 204,
      body: { issueId: issue.id },
    });
    expect(toppo.comments.map(({ body }) => body)).toStrictEqual(['Linked.', 'Linked.']);
  });

  it('refuses what the service did not sign, and what Toppo would not send back', async () => {
    const { plugin, route, odd } = linker();
    const toppo = createTestToppo(plugin, { settings: { secret: 's3cret' } });
    const issue = toppo.createIssue();

    expect(
      await toppo.receive(
        route,
        signed({ scheme: 'github', secret: 'guessed' }, { issueId: issue.id }),
      ),
    ).toStrictEqual({ status: 401 });
    expect(await toppo.receive(route)).toStrictEqual({ status: 401 });
    await expect(toppo.receive(odd)).rejects.toThrow('Toppo would refuse what odd.receive answers');
    expect(toppo.comments).toStrictEqual([]);
  });
});
