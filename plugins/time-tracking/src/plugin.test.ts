import type { ServedScreens } from '@toppo-tracker/plugin-sdk';
import { SCREEN_RUNTIME_GLOBAL } from '@toppo-tracker/plugin-sdk/protocol';
import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it, vi } from 'vitest';
import { logTime } from './actions/log-time.action.ts';
import { plugin } from './plugin.ts';
import { issueTimePanel } from './screens/issue-time.panel.ts';
import { timeReportPage } from './screens/time-report.page.ts';

describe('the time tracking plugin', () => {
  it('declares what is approved and set: reading issues, a permission, its settings, the time spent it writes', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest).toMatchObject({
      id: 'time-tracking',
      logo: 'logo.png',
      needs: ['issue.read'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      settings: {
        properties: { hoursPerDay: { type: 'number', minimum: 1, maximum: 24, default: 8 } },
      },
      projectSettings: {
        properties: { budgetDays: { type: 'number', exclusiveMinimum: 0, maximum: 100_000 } },
      },
      entities: {
        timeEntry: { attachedTo: 'issue', fields: { required: ['minutes', 'spentOn'] } },
      },
      properties: {
        timeSpent: {
          name: 'properties.timeSpent',
          type: 'number',
          display: 'duration',
          writtenBy: 'plugin',
        },
      },
      events: [],
      actions: [{ name: 'timeEntry.log' }],
    });
  });

  it('shows its time beside each issue, and across its projects in a page of the main sidebar', () => {
    const { manifest } = createTestToppo(plugin);

    expect([timeReportPage, issueTimePanel]).toStrictEqual([
      { name: 'report', zone: 'main' },
      { name: 'issueTime', on: 'issue' },
    ]);
    expect(manifest.pages).toStrictEqual([
      {
        name: 'report',
        zone: 'main',
        access: 'authenticated',
        title: 'pages.report.title',
        nav: { label: 'pages.report.nav', icon: 'clock' },
      },
    ]);
    expect(manifest.panels).toStrictEqual([
      { name: 'issueTime', on: 'issue', access: 'authenticated', title: 'panels.issueTime.title' },
    ]);
  });

  it('hands each screen’s component to Toppo’s runtime, in a screen’s frame', async () => {
    const served: ServedScreens[] = [];
    vi.stubGlobal(SCREEN_RUNTIME_GLOBAL, {
      serve: (screens: ServedScreens) => served.push(screens),
    });
    vi.resetModules();
    try {
      await import('./screens/time-report.page.ts');
      await import('./screens/issue-time.panel.ts');
    } finally {
      vi.unstubAllGlobals();
    }

    const [screens] = served;
    expect(screens?.id).toBe('time-tracking');
    expect(await screens?.component('report')?.()).toHaveProperty('name', 'TimeReportPage');
    expect(await screens?.component('issueTime')?.()).toHaveProperty('name', 'IssueTimePanel');
    expect(screens?.component('elsewhere')).toBeUndefined();
  });

  it.each([
    ['its default', {}],
    ['part of an hour', { hoursPerDay: 7.5 }],
  ])('runs with a working day of %s', async (_, settings) => {
    const toppo = createTestToppo(plugin, { settings });
    const issue = toppo.createIssue();

    await expect(
      toppo
        .createUser({ permissions: ['entries.log'] })
        .run(logTime, { issueId: issue.id, minutes: 30, spentOn: '2026-10-28' }),
    ).resolves.toMatchObject({ minutes: 30 });
  });

  it.each([
    ['no hour', 0],
    ['more than a day has', 25],
  ])('refuses a working day of %s', async (_, hoursPerDay) => {
    const toppo = createTestToppo(plugin, { settings: { hoursPerDay } });
    const issue = toppo.createIssue();

    await expect(
      toppo
        .createUser({ permissions: ['entries.log'] })
        .run(logTime, { issueId: issue.id, minutes: 30, spentOn: '2026-10-28' }),
    ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
  });

  it.each([
    ['takes no budget', {}, true],
    ['takes part of a day', { budgetDays: 12.5 }, true],
    ['refuses no day at all', { budgetDays: 0 }, false],
  ])('%s, as a project’s budget', (_, budget, taken) => {
    expect(plugin.projectSettings.safeParse(budget).success).toBe(taken);
  });

  it('names itself, its permission and its settings in English and French', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest.messages.en).toMatchObject({
      plugin: { name: 'Time tracking' },
      permissions: { log: 'Log time' },
      settings: { hoursPerDay: { label: 'Hours in a working day' } },
      projectSettings: { budgetDays: { label: 'Budget, in days' } },
    });
    expect(manifest.messages.fr).toMatchObject({
      plugin: { name: 'Suivi du temps' },
      permissions: { log: 'Saisir du temps' },
      settings: { hoursPerDay: { label: 'Heures dans une journée de travail' } },
      projectSettings: { budgetDays: { label: 'Budget, en jours' } },
    });
  });
});
