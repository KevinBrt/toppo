import { definePlugin } from '@toppo-tracker/plugin-sdk';

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
  messages: {
    en: {
      plugin: {
        name: 'Time tracking',
        description: 'Log the time spent on each issue, and see where it went.',
      },
      permissions: { log: 'Log time' },
    },
    fr: {
      plugin: {
        name: 'Suivi du temps',
        description: 'Saisissez le temps passé sur chaque ticket, et voyez où il est allé.',
      },
      permissions: { log: 'Saisir du temps' },
    },
  },
});
