import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

/**
 * Time tracking: who spent how long on which issue. Toppo's reference plugin, built with
 * `toppo plugin build` and tested with `@toppo-tracker/plugin-testing`, as any author would.
 */
export const plugin = definePlugin({
  id: 'time-tracking',
  name: 'plugin.name',
  description: 'plugin.description',
  logo: 'logo.png',
  apiVersion: '^1.0',
  // Time is logged on an issue: someone acting through the plugin sees only what it sees.
  needs: ['issue.read'],
  permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
  settings: z.object({
    // Time is logged in minutes and counted in days, as projects' budgets are.
    hoursPerDay: z.number().min(1).max(24).default(8),
  }),
  messages: {
    en: {
      plugin: {
        name: 'Time tracking',
        description: 'Log the time spent on each issue, and see where it went.',
      },
      permissions: { log: 'Log time' },
      settings: {
        hoursPerDay: {
          label: 'Hours in a working day',
          help: 'The time logged counts in days of this many hours, as projects’ budgets do.',
        },
      },
    },
    fr: {
      plugin: {
        name: 'Suivi du temps',
        description: 'Saisissez le temps passé sur chaque ticket, et voyez où il est allé.',
      },
      permissions: { log: 'Saisir du temps' },
      settings: {
        hoursPerDay: {
          label: 'Heures dans une journée de travail',
          help: 'Le temps saisi se compte en journées de ce nombre d’heures, comme les budgets des projets.',
        },
      },
    },
  },
});
