import { definePlugin, defineProperty, z } from '@toppo-tracker/plugin-sdk';
import { describe, expect, it } from 'vitest';
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
  return { plugin, logTime, ask, budget };
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
      actions: [{ name: 'timeEntry.log' }, { name: 'issue.peek' }, { name: 'project.budget' }],
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
