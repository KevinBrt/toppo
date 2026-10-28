import { describe, expect, it } from 'vitest';
import { definePlugin, z } from './index.ts';

/**
 * Mistakes a plugin's author could make, each of which TypeScript must refuse: were one accepted,
 * `npm run typecheck` would report the directive above it as unused. Handlers are defined, never
 * run.
 */
describe('the types of a plugin', () => {
  it('refuse its author’s mistakes before anything runs', () => {
    const en = { permissions: { log: 'Log time' }, errors: { tooMuch: 'Too much' } } as const;
    const fr = { permissions: { log: 'Saisir' }, errors: { tooMuch: 'Trop' } } as const;
    const declared = { id: 'time-tracking', apiVersion: '^1.0', messages: { en, fr } } as const;

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

    const plugin = definePlugin({
      ...declared,
      needs: ['issue.read', 'comment.create'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      settings: z.object({ maxMinutesPerDay: z.int().default(600) }),
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
});
