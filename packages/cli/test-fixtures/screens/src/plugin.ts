import { definePlugin, z } from '@toppo-tracker/plugin-sdk';

const WORDS = { name: 'Hours', description: 'Hours spent.', report: 'Report' } as const;

/** A plugin with a page, drawn by React in its frame. */
export const plugin = definePlugin({
  id: 'screens',
  name: 'name',
  description: 'description',
  apiVersion: '^1.0',
  messages: { en: WORDS, fr: WORDS },
});

plugin.definePage({
  name: 'report',
  zone: 'main',
  access: 'authenticated',
  title: 'report',
  nav: { label: 'report', icon: 'clock' },
  component: () => import('./web/report-page.tsx').then((module) => module.ReportPage),
});

/** The same screen, opened over the page by another one. */
plugin.defineDialog({
  name: 'reportOver',
  access: 'authenticated',
  title: 'report',
  input: z.object({}),
  component: () => import('./web/report-page.tsx').then((module) => module.ReportPage),
});

/** Done on the server only: what a screen runs, never reads. */
function serverOnly(minutes: number): string {
  return `Server’s own secret ways, ${minutes} minutes`;
}

export const logHours = plugin.defineAction({
  name: 'hours.log',
  access: 'authenticated',
  input: z.object({ minutes: z.int().min(1) }),
  handler: (_, { minutes }) => Promise.resolve(serverOnly(minutes)),
});

plugin.defineEventHandler({
  event: 'issue.created',
  async handler() {
    await Promise.resolve('Told of the issue on the server only');
  },
});

plugin.defineJob({
  name: 'weekly',
  every: 'week',
  label: 'report',
  async handler() {
    await Promise.resolve('Done each week on the server only');
  },
});

plugin.defineRoute({
  name: 'hours.receive',
  async handler() {
    return await Promise.resolve({ status: 202, body: 'Received on the server only' });
  },
});
