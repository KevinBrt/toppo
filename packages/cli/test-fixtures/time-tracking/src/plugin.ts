import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

/** A plugin to build: its actions and events live in files of their own. */
export const plugin = definePlugin({
  id: 'time-tracking',
  apiVersion: '^1.0',
  needs: ['issue.read', 'comment.create'],
  permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
  settings: z.object({ maxMinutesPerDay: z.int().min(1).default(600) }),
  messages: {
    en: { permissions: { log: 'Log time' }, closed: 'Closed.' },
    fr: { permissions: { log: 'Saisir du temps' }, closed: 'Fermé.' },
  },
});
