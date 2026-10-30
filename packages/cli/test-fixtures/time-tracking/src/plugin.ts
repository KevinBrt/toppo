import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

/** A plugin to build: its actions and events live in files of their own. */
export const plugin = definePlugin({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  logo: 'logo.png',
  apiVersion: '^1.0',
  needs: ['issue.read', 'comment.create'],
  permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
  settings: z.object({ maxMinutesPerDay: z.int().min(1).default(600) }),
  messages: {
    en: {
      plugin: { name: 'Time tracking', description: 'Time spent on each issue.' },
      permissions: { log: 'Log time' },
      settings: { maxMinutesPerDay: { label: 'Minutes a day, at most' } },
      closed: 'Closed.',
    },
    fr: {
      plugin: { name: 'Suivi du temps', description: 'Le temps passé sur chaque ticket.' },
      permissions: { log: 'Saisir du temps' },
      settings: { maxMinutesPerDay: { label: 'Minutes par jour, au plus' } },
      closed: 'Fermé.',
    },
  },
});
