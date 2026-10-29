import { describe, expect, it } from 'vitest';
import { defineEntity, definePlugin, z } from './index.ts';

/**
 * Mistakes a plugin's author could make, each of which TypeScript must refuse: were one accepted,
 * `npm run typecheck` would report the directive above it as unused. Handlers are defined, never
 * run.
 */
describe('the types of a plugin', () => {
  it('refuse its author’s mistakes before anything runs', () => {
    const en = {
      name: 'Time tracking',
      permissions: { log: 'Log time' },
      errors: { tooMuch: 'Too much' },
    } as const;
    const fr = {
      name: 'Suivi du temps',
      permissions: { log: 'Saisir' },
      errors: { tooMuch: 'Trop' },
    } as const;
    const declared = {
      id: 'time-tracking',
      name: 'name',
      description: 'name',
      apiVersion: '^1.0',
      messages: { en, fr },
    } as const;

    // Each mistake of a declaration alone: one hides the next, as TypeScript reports one at a time.
    // @ts-expect-error a core permission plugins cannot need
    definePlugin({ ...declared, needs: ['instance.users.manage'] });
    definePlugin({
      ...declared,
      // @ts-expect-error a label that is no message key
      permissions: { 'reports.read': { scope: 'project', label: 'permissions.reports' } },
    });
    // @ts-expect-error French words with a key missing
    definePlugin({ ...declared, messages: { en, fr: { permissions: { log: 'Saisir' } } } });
    // @ts-expect-error a description that is no message key
    definePlugin({ ...declared, description: 'Logs time' });
    // @ts-expect-error a logo Toppo would not show
    definePlugin({ ...declared, logo: 'logo.svg' });

    const plugin = definePlugin({
      ...declared,
      needs: ['issue.read', 'comment.create'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      settings: z.object({ maxMinutesPerDay: z.int().default(600) }),
      projectSettings: z.object({ budgetDays: z.number().optional() }),
    });

    plugin.defineAction({
      name: 'timeEntry.log',
      // @ts-expect-error a permission the plugin neither adds nor needs
      access: { permission: 'reports.reed' },
      input: z.object({ issueId: z.uuid() }),
      handler: () => Promise.resolve(null),
    });
    plugin.defineAction({
      name: 'timeEntry.edit',
      // @ts-expect-error an issue named by a field the input does not have
      access: { issue: 'issueID' },
      input: z.object({ issueId: z.uuid(), minutes: z.int() }),
      handler(ctx, input) {
        // @ts-expect-error a setting that does not exist
        ctx.settings.maxMinutes;
        // @ts-expect-error an input field that does not exist
        input.minute;
        // @ts-expect-error a message key that does not exist
        ctx.t('errors.toMuch');
        // @ts-expect-error an error that is no message key
        return Promise.reject(ctx.fail('errors.unknown'));
      },
    });
    plugin.defineAction({
      name: 'timeEntry.count',
      // @ts-expect-error an issue named by a field that holds no string
      access: { issue: 'minutes' },
      input: z.object({ minutes: z.int() }),
      handler: () => Promise.resolve(null),
    });
    plugin.defineEventHandler({
      event: 'issue.statusChanged',
      async handler(ctx, { issue, change }) {
        // @ts-expect-error an event is handled as the plugin itself, for nobody
        ctx.user;
        // @ts-expect-error what another event carries
        change.added;
        // @ts-expect-error a comment without its words
        await ctx.issues.comment(issue.id);
        const { budgetDays } = await ctx.projects.settings(issue.projectId);
        // @ts-expect-error a project setting that may be left empty
        budgetDays.toFixed();
        // @ts-expect-error an instance setting is not a project's
        (await ctx.projects.settings(issue.projectId)).maxMinutesPerDay;
      },
    });
    plugin.defineEventHandler({
      event: 'issue.deleted',
      handler(_, { issue }) {
        // @ts-expect-error what is left of a deleted issue: no title
        issue.title;
        return Promise.resolve();
      },
    });
    plugin.defineEventHandler({
      // @ts-expect-error an event Toppo does not send
      event: 'issue.archived',
      handler: () => Promise.resolve(),
    });

    expect(plugin.id).toBe('time-tracking');
  });

  it('refuse records that do not fit their entity', () => {
    const name = { name: 'Time tracking' } as const;
    const timeEntry = defineEntity({
      attachedTo: 'issue',
      fields: z.object({ minutes: z.int(), note: z.string().max(500).optional() }),
      // @ts-expect-error records on issues are bounded by issue, not by project
      limits: { perProject: 10 },
    });
    const budget = defineEntity({ attachedTo: 'project', fields: z.object({ days: z.number() }) });
    const plugin = definePlugin({
      id: 'time-tracking',
      name: 'name',
      description: 'name',
      apiVersion: '^1.0',
      needs: ['issue.read'],
      entities: { timeEntry, budget },
      messages: { en: name, fr: name },
    });

    plugin.defineEventHandler({
      event: 'issue.statusChanged',
      async handler(ctx, { issue }) {
        // @ts-expect-error a record on an issue names its issue
        await ctx.entities.timeEntry.create({ minutes: 30 });
        // @ts-expect-error a field the entity does not have
        await ctx.entities.timeEntry.create({ issueId: issue.id, minutes: 30, hours: 1 });
        // @ts-expect-error a record on a project names its project
        await ctx.entities.budget.create({ issueId: issue.id, days: 20 });
        // @ts-expect-error only a number is summed
        await ctx.entities.timeEntry.sum('note');
        const entry = await ctx.entities.timeEntry.create({ issueId: issue.id, minutes: 30 });
        const plan = await ctx.entities.budget.create({ projectId: issue.projectId, days: 20 });
        // @ts-expect-error a record on a project hangs on no issue
        plan.issueId.length;
        // @ts-expect-error an entity the plugin does not keep
        ctx.entities.estimate;
        expect(entry.issueId.length + entry.minutes).toBeGreaterThan(0);
      },
    });

    expect(plugin.entities.timeEntry.attachedTo).toBe('issue');
  });
});
