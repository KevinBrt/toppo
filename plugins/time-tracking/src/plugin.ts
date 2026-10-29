import { definePlugin, secret, z } from '@toppo-tracker/plugin-sdk';
import { timeEntry } from './entities/time-entry.entity.ts';
import { timeSpent } from './properties/time-spent.property.ts';

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
    // A chat's incoming webhook: anyone who has its address may post there.
    summaryUrl: secret(z.url()).optional(),
    summaryLanguage: z.enum(['en', 'fr']).default('en'),
  }),
  http: { fromSettings: ['summaryUrl'] },
  projectSettings: z.object({
    // The whole project's, all issues together. A mark, not a limit: no time is refused.
    budgetDays: z.number().positive().max(100_000).optional(),
  }),
  entities: { timeEntry },
  properties: { timeSpent },
  messages: {
    en: {
      plugin: {
        name: 'Time tracking',
        description: 'Log the time spent on each issue, and see where it went.',
      },
      permissions: { log: 'Log time' },
      properties: { timeSpent: 'Time spent' },
      pages: {
        report: {
          title: 'Time',
          nav: 'Time',
          description:
            'The time logged in the projects you see, in days of {hours} hours, against each project’s budget.',
          project: 'Project',
          allProjects: 'All projects',
          caption: 'Time by project',
          empty: 'No time logged yet.',
          columns: {
            project: 'Project',
            spent: 'Spent',
            budget: 'Budget',
            closed: 'Closed issues',
            open: 'Other issues',
            status: 'Budget',
          },
          days: '{days} d',
          overBudget: 'Over budget',
          withinBudget: 'Within budget',
          noBudget: 'No budget',
        },
      },
      panels: {
        issueTime: {
          title: 'Time spent',
          total: 'Total',
          caption: 'Time logged on this issue',
          empty: 'No time logged on this issue yet.',
          columns: { who: 'Who', day: 'Day', time: 'Time', note: 'Note' },
          time: 'Time spent',
          day: 'Day',
          note: 'Note',
          log: 'Log time',
          logged: 'Time logged.',
        },
      },
      errors: {
        forbidden: 'You may not log time on this issue.',
        invalid: 'Check the time and the day.',
        failed: 'This could not be done. Try again.',
      },
      settings: {
        hoursPerDay: {
          label: 'Hours in a working day',
          help: 'The time logged counts in days of this many hours, as projects’ budgets do.',
        },
        summaryUrl: {
          label: 'Weekly summary, to a chat',
          help: 'The address of an incoming webhook (Slack, Mattermost, Rocket.Chat): each week, the time of the week by project. Kept secret.',
        },
        summaryLanguage: {
          label: 'Language of the summary',
          options: { en: 'English', fr: 'French' },
        },
      },
      jobs: { weeklySummary: 'Sends the time of the week to a chat' },
      summary: {
        title: 'Time logged from {from} to {to}:',
        line: '• {project}: {week} h this week, {spent} d in all',
        lineBudget: '• {project}: {week} h this week, {spent} d of {budget} d',
        lineOver: '• {project}: {week} h this week, {spent} d of {budget} d, over budget',
      },
      projectSettings: {
        budgetDays: {
          label: 'Budget, in days',
          help: 'The working days this project may take, all issues together. No time is refused.',
        },
      },
    },
    fr: {
      plugin: {
        name: 'Suivi du temps',
        description: 'Saisissez le temps passé sur chaque ticket, et voyez où il est allé.',
      },
      permissions: { log: 'Saisir du temps' },
      properties: { timeSpent: 'Temps passé' },
      pages: {
        report: {
          title: 'Temps',
          nav: 'Temps',
          description:
            'Le temps saisi dans les projets que vous voyez, en journées de {hours} heures, face au budget de chaque projet.',
          project: 'Projet',
          allProjects: 'Tous les projets',
          caption: 'Temps par projet',
          empty: 'Aucun temps saisi pour l’instant.',
          columns: {
            project: 'Projet',
            spent: 'Passé',
            budget: 'Budget',
            closed: 'Tickets fermés',
            open: 'Autres tickets',
            status: 'Budget',
          },
          days: '{days} j',
          overBudget: 'Budget dépassé',
          withinBudget: 'Dans le budget',
          noBudget: 'Pas de budget',
        },
      },
      panels: {
        issueTime: {
          title: 'Temps passé',
          total: 'Total',
          caption: 'Temps saisi sur ce ticket',
          empty: 'Aucun temps saisi sur ce ticket pour l’instant.',
          columns: { who: 'Qui', day: 'Jour', time: 'Temps', note: 'Note' },
          time: 'Temps passé',
          day: 'Jour',
          note: 'Note',
          log: 'Saisir du temps',
          logged: 'Temps saisi.',
        },
      },
      errors: {
        forbidden: 'Vous ne pouvez pas saisir de temps sur ce ticket.',
        invalid: 'Vérifiez le temps et le jour.',
        failed: 'Cela n’a pas pu se faire. Réessayez.',
      },
      settings: {
        hoursPerDay: {
          label: 'Heures dans une journée de travail',
          help: 'Le temps saisi se compte en journées de ce nombre d’heures, comme les budgets des projets.',
        },
        summaryUrl: {
          label: 'Résumé de la semaine, vers un chat',
          help: 'L’adresse d’un webhook entrant (Slack, Mattermost, Rocket.Chat) : chaque semaine, le temps de la semaine par projet. Gardée secrète.',
        },
        summaryLanguage: {
          label: 'Langue du résumé',
          options: { en: 'Anglais', fr: 'Français' },
        },
      },
      jobs: { weeklySummary: 'Envoie le temps de la semaine à un chat' },
      summary: {
        title: 'Temps saisi du {from} au {to} :',
        line: '• {project} : {week} h cette semaine, {spent} j en tout',
        lineBudget: '• {project} : {week} h cette semaine, {spent} j sur {budget} j',
        lineOver: '• {project} : {week} h cette semaine, {spent} j sur {budget} j, budget dépassé',
      },
      projectSettings: {
        budgetDays: {
          label: 'Budget, en jours',
          help: 'Les journées de travail que ce projet peut prendre, tous tickets confondus. Aucun temps n’est refusé.',
        },
      },
    },
  },
});
