import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

/**
 * A plugin written with the SDK, as an author would: the sandbox's tests bundle it and run it in
 * QuickJS, the SDK and Zod with it. Never imported by the server itself.
 */
const plugin = definePlugin({
  id: 'sdk-check',
  apiVersion: '^1.0',
  needs: ['issue.read', 'comment.create'],
  settings: z.object({ maxMinutesPerDay: z.int().min(1).default(600) }),
  messages: {
    en: {
      errors: { dailyLimit: 'At most {limit} minutes a day.' },
      closed: 'Closed, {minutes} minutes in.',
    },
    fr: {
      errors: { dailyLimit: '{limit} minutes par jour au plus.' },
      closed: 'Fermé, après {minutes} minutes.',
    },
  },
});

plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId' },
  input: z.object({ issueId: z.uuid(), minutes: z.int().min(1) }),
  async handler(ctx, input) {
    if (input.minutes > ctx.settings.maxMinutesPerDay) {
      throw ctx.fail('errors.dailyLimit', { limit: ctx.settings.maxMinutesPerDay });
    }
    const issue = await ctx.issues.get(input.issueId);
    return { key: issue?.key ?? null, minutes: input.minutes, user: ctx.user.id };
  },
});

plugin.defineEventHandler({
  event: 'issue.statusChanged',
  async handler(ctx, { event, issue }) {
    if (issue.closedAt !== null) {
      await ctx.issues.comment(issue.id, ctx.t('closed', { minutes: 90 }), { once: event.id });
    }
  },
});
