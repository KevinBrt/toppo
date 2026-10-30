import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Refused', description: 'A plugin to build.' } as const;

/**
 * Two things Toppo refuses: an id that is not lowercase words joined by dashes, and an action on
 * an issue from a plugin that does not read issues.
 */
const plugin = definePlugin({
  id: 'Bad_Id',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});

plugin.defineAction({
  name: 'timeEntry.log',
  access: { issue: 'issueId' },
  input: z.object({ issueId: z.uuid() }),
  handler: () => Promise.resolve(null),
});
