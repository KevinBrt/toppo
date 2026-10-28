import { afterEach, describe, expect, it, vi } from 'vitest';
import { definitionOf } from './definition.ts';
import { z } from './index.ts';
import { definePlugin } from './plugin.ts';
import { manifestSchema } from './protocol/manifest.ts';
import type { HostGlobal } from './protocol/sandbox.ts';
import { servePlugin } from './serve.ts';

const ADA = '01a1569b-9900-7000-8000-000000000001';
const ISSUE = '01a1569b-9900-7000-8000-000000000042';
const PROJECT = '01a1569b-9900-7000-8000-000000000100';
const STATUS = { id: '01a1569b-9900-7000-8000-000000000201', name: 'Done', closes: true };
const NOW = '2026-11-02T09:00:00.000Z';

const snapshot = {
  id: ISSUE,
  key: 'WEB-42',
  projectId: PROJECT,
  projectKey: 'WEB',
  title: 'Invoices fail to download',
  status: STATUS,
  category: { id: '01a1569b-9900-7000-8000-000000000301', name: 'Bug' },
  priority: { id: '01a1569b-9900-7000-8000-000000000401', name: 'High', level: 3 },
  assigneeId: ADA,
  reporterId: ADA,
  closedAt: NOW,
  createdAt: NOW,
  updatedAt: NOW,
};

const en = {
  plugin: { name: 'Time tracking', description: 'Time spent on each issue.' },
  permissions: { log: 'Log time' },
  settings: { maxMinutesPerDay: { label: 'Minutes a day, at most' } },
  projectSettings: {
    budgetDays: { label: 'Budget, in days' },
    reportedEvery: { label: 'Reported every' },
  },
  errors: { dailyLimit: 'At most {limit} minutes a day.' },
  comment: { closedAfter: 'Closed after {minutes} minutes.' },
} as const;

/** A plugin as an author writes one, defined anew for each test. */
function timeTracking() {
  const plugin = definePlugin({
    id: 'time-tracking',
    name: 'plugin.name',
    description: 'plugin.description',
    logo: 'logo.png',
    apiVersion: '^1.0',
    needs: ['issue.read', 'comment.create'],
    permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
    settings: z.object({ maxMinutesPerDay: z.int().min(1).default(600) }),
    projectSettings: z.object({
      budgetDays: z.number().positive().optional(),
      reportedEvery: z.enum(['week', 'month']).default('month'),
    }),
    messages: {
      en,
      fr: {
        plugin: { name: 'Suivi du temps', description: 'Le temps passé sur chaque ticket.' },
        permissions: { log: 'Saisir du temps' },
        settings: { maxMinutesPerDay: { label: 'Minutes par jour, au plus' } },
        projectSettings: {
          budgetDays: { label: 'Budget, en jours' },
          reportedEvery: { label: 'Rapport tous les' },
        },
        errors: { dailyLimit: '{limit} minutes par jour au plus.' },
        comment: { closedAfter: 'Fermé après {minutes} minutes.' },
      },
    },
  });
  plugin.defineAction({
    name: 'timeEntry.log',
    access: { issue: 'issueId', permission: 'entries.log' },
    input: z.object({ issueId: z.uuid(), minutes: z.int().min(1) }),
    async handler(ctx, input) {
      if (input.minutes > ctx.settings.maxMinutesPerDay) {
        throw ctx.fail('errors.dailyLimit', { limit: ctx.settings.maxMinutesPerDay });
      }
      const issue = await ctx.issues.get(input.issueId);
      return { user: ctx.user.id, key: issue?.key ?? null, said: ctx.t('errors.dailyLimit') };
    },
  });
  plugin.defineAction({
    name: 'oddities.run',
    access: 'authenticated',
    input: z.object({ what: z.string() }),
    async handler(ctx, { what }) {
      switch (what) {
        case 'throw':
          throw new Error('Something broke');
        case 'bigint':
          return { count: 10n };
        case 'empty-comment':
          return await ctx.issues.comment(ISSUE, '   ');
        case 'budget':
          return await ctx.projects.settings(PROJECT);
        default:
          return await ctx.issues.get(ISSUE);
      }
    },
  });
  plugin.defineEventHandler({
    event: 'issue.statusChanged',
    async handler(ctx, { event, issue }) {
      if (issue.closedAt !== null) {
        await ctx.issues.comment(issue.id, ctx.t('comment.closedAfter', { minutes: 90 }), {
          once: event.id,
        });
      }
    },
  });
  return plugin;
}

/** A fake Toppo: answers calls as given, records them. */
function fakeHost(answers: Record<string, unknown> = {}) {
  const call = vi.fn((method: string, _args: string) =>
    method in answers
      ? Promise.resolve(JSON.stringify(answers[method]))
      : Promise.reject(new Error('FORBIDDEN')),
  );
  const host: HostGlobal = { call };
  return { host, call };
}

function context(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({ locale: 'en', user: { id: ADA }, settings: {}, ...overrides });
}

async function act(host: HostGlobal, name: string, input: unknown, ctx = context()) {
  return JSON.parse(
    await servePlugin(timeTracking(), host).run('action', name, JSON.stringify(input), ctx),
  );
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, '__host');
  Reflect.deleteProperty(globalThis, '__toppo');
});

describe('a plugin served to Toppo', () => {
  it('declares a manifest Toppo accepts: its name, needs, permissions, settings, words, actions and events', () => {
    const { host } = fakeHost();
    const manifest = JSON.parse(servePlugin(timeTracking(), host).manifest());

    expect(manifestSchema.parse(manifest)).toStrictEqual(manifest);
    expect(manifest).toMatchObject({
      id: 'time-tracking',
      name: 'plugin.name',
      description: 'plugin.description',
      logo: 'logo.png',
      apiVersion: '^1.0',
      needs: ['issue.read', 'comment.create'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      settings: { properties: { maxMinutesPerDay: { type: 'integer', default: 600 } } },
      messages: { en, fr: { permissions: { log: 'Saisir du temps' } } },
      actions: [
        {
          name: 'timeEntry.log',
          access: { issue: 'issueId', permission: 'entries.log' },
          input: { required: ['issueId', 'minutes'] },
        },
        { name: 'oddities.run', access: 'authenticated' },
      ],
      events: ['issue.statusChanged'],
    });
  });

  it('checks settings typed for the instance or a project, by its own schemas, whatever is saved', async () => {
    const { host, call } = fakeHost();
    const served = servePlugin(timeTracking(), host);
    // What is saved no longer fits: the check is of what was typed.
    const saved = context({ user: null, settings: { maxMinutesPerDay: 'many' } });
    const check = async (scope: string, typed: unknown) =>
      JSON.parse(await served.run('settings', scope, JSON.stringify(typed), saved));

    expect(await check('instance', { maxMinutesPerDay: 480 })).toStrictEqual({
      ok: true,
      result: null,
    });
    expect(await check('instance', {})).toStrictEqual({ ok: true, result: null });
    expect(await check('instance', { maxMinutesPerDay: 0 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', issues: [{ path: 'maxMinutesPerDay' }] },
    });
    expect(await check('project', { budgetDays: 12.5 })).toStrictEqual({ ok: true, result: null });
    expect(await check('project', { budgetDays: -1 })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED', issues: [{ path: 'budgetDays' }] },
    });
    expect(await check('somewhere', {})).toStrictEqual({
      ok: false,
      error: { code: 'UNKNOWN_SETTINGS' },
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('answers which projects’ settings it refuses, as an upgrade checks them', async () => {
    const { host } = fakeHost();
    const served = servePlugin(timeTracking(), host);
    const check = async (saved: unknown) =>
      JSON.parse(await served.run('settings', 'projects', JSON.stringify(saved), context()));

    expect(
      await check({ [PROJECT]: { budgetDays: 20 }, [ISSUE]: { reportedEvery: 'day' } }),
    ).toStrictEqual({ ok: true, result: [ISSUE] });
    expect(await check([])).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
  });

  it('reads a project’s settings from Toppo, its defaults applied, or fails on those it refuses', async () => {
    const answered = (settings: unknown) =>
      act(fakeHost({ 'projects.settings': settings }).host, 'oddities.run', { what: 'budget' });

    expect(await answered({ budgetDays: 20 })).toStrictEqual({
      ok: true,
      result: { budgetDays: 20, reportedEvery: 'month' },
    });
    expect(await answered({ budgetDays: 'many' })).toMatchObject({
      ok: false,
      error: { code: 'PLUGIN_ERROR' },
      detail: `The settings of project ${PROJECT} do not fit this version`,
    });
  });

  it('runs an action for its user, with its settings defaulted and its calls to Toppo', async () => {
    const { host, call } = fakeHost({ 'issues.get': { ...snapshot, description: '' } });

    expect(await act(host, 'timeEntry.log', { issueId: ISSUE, minutes: 30 })).toStrictEqual({
      ok: true,
      result: { user: ADA, key: 'WEB-42', said: 'At most {limit} minutes a day.' },
    });
    expect(call).toHaveBeenCalledWith('issues.get', JSON.stringify({ issueId: ISSUE }));
  });

  it('refuses in the plugin’s words, with their params, in the language asked', async () => {
    const { host } = fakeHost();

    expect(
      await act(
        host,
        'timeEntry.log',
        { issueId: ISSUE, minutes: 120 },
        context({ settings: { maxMinutesPerDay: 60 } }),
      ),
    ).toStrictEqual({ ok: false, error: { code: 'errors.dailyLimit', params: { limit: 60 } } });
  });

  it('checks an action’s input and the settings before running it', async () => {
    const { host, call } = fakeHost();

    expect(await act(host, 'timeEntry.log', { issueId: 'nope', minutes: 0 })).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        issues: [{ path: 'issueId' }, { path: 'minutes' }],
      },
    });
    expect(
      await act(
        host,
        'timeEntry.log',
        { issueId: ISSUE, minutes: 1 },
        context({ settings: { maxMinutesPerDay: 'many' } }),
      ),
    ).toStrictEqual({ ok: false, error: { code: 'INVALID_SETTINGS' } });
    expect(await act(host, 'timeEntry.missing', {})).toStrictEqual({
      ok: false,
      error: { code: 'UNKNOWN_ACTION' },
    });
    expect(call).not.toHaveBeenCalled();
  });

  it.each([
    ['its own error', 'throw', 'Something broke'],
    ['what cannot travel as JSON', 'bigint', expect.stringMatching(/BigInt/)],
    ['a call it makes wrong, before it reaches Toppo', 'empty-comment', expect.any(String)],
    ['a refusal of Toppo’s it lets through', 'refused', 'FORBIDDEN'],
  ])('answers %s as its error, for Toppo’s log', async (_, what, detail) => {
    const { host, call } = fakeHost();

    expect(await act(host, 'oddities.run', { what })).toStrictEqual({
      ok: false,
      error: { code: 'PLUGIN_ERROR' },
      detail,
    });
    if (what === 'empty-comment') {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it('checks Toppo’s answers too', async () => {
    const { host } = fakeHost({ 'issues.get': { id: 'not an issue' } });

    expect(await act(host, 'oddities.run', { what: 'get' })).toMatchObject({
      ok: false,
      error: { code: 'PLUGIN_ERROR' },
    });
  });

  it('runs an action only for someone', async () => {
    const { host } = fakeHost();

    expect(await act(host, 'oddities.run', { what: 'get' }, context({ user: null }))).toStrictEqual(
      {
        ok: false,
        error: { code: 'PLUGIN_ERROR' },
        detail: 'The action oddities.run runs for someone',
      },
    );
  });

  it('handles an event as itself, in the instance’s language, once', async () => {
    const { host, call } = fakeHost({ 'issues.comment': { commentId: ADA } });
    const event = {
      event: { id: ISSUE, type: 'issue.statusChanged', occurredAt: NOW, actorId: ADA },
      issue: snapshot,
      change: { from: { id: ADA, name: 'Open' }, to: { id: STATUS.id, name: 'Done' } },
    };

    const answer = await servePlugin(timeTracking(), host).run(
      'event',
      'issue.statusChanged',
      JSON.stringify(event),
      context({ locale: 'fr', user: null }),
    );

    expect(JSON.parse(answer)).toStrictEqual({ ok: true, result: null });
    expect(call).toHaveBeenCalledWith(
      'issues.comment',
      JSON.stringify({ issueId: ISSUE, body: 'Fermé après 90 minutes.', once: ISSUE }),
    );
  });

  it('checks an event’s payload, and the events it handles', async () => {
    const plugin = servePlugin(timeTracking(), fakeHost().host);

    expect(
      JSON.parse(await plugin.run('event', 'issue.statusChanged', '{}', context({ user: null }))),
    ).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED' } });
    expect(
      JSON.parse(await plugin.run('event', 'issue.created', '{}', context({ user: null }))),
    ).toStrictEqual({ ok: false, error: { code: 'UNKNOWN_EVENT' } });
    expect(
      JSON.parse(await plugin.run('event', 'issue.unheardOf', '{}', context({ user: null }))),
    ).toStrictEqual({ ok: false, error: { code: 'UNKNOWN_EVENT' } });
  });

  it('answers Toppo in its sandbox only, through `__toppo`', () => {
    timeTracking();
    expect(Reflect.get(globalThis, '__toppo')).toBeUndefined();

    Reflect.set(globalThis, '__host', fakeHost().host);
    timeTracking();

    expect(Reflect.get(globalThis, '__toppo')).toMatchObject({
      manifest: expect.any(Function),
      run: expect.any(Function),
    });
  });

  it('defines each action and event once', () => {
    const plugin = timeTracking();

    expect(() =>
      plugin.defineAction({
        name: 'timeEntry.log',
        access: 'authenticated',
        input: z.object({}),
        handler: () => Promise.resolve(null),
      }),
    ).toThrow('The action timeEntry.log is defined twice');
    expect(() =>
      plugin.defineEventHandler({ event: 'issue.statusChanged', handler: () => Promise.resolve() }),
    ).toThrow('The event issue.statusChanged has a handler already');
    expect(() => definitionOf({})).toThrow('Not a plugin');
  });
});
