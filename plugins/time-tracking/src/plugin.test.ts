import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { logTime } from './actions/log-time.action.ts';
import { plugin } from './plugin.ts';

describe('the time tracking plugin', () => {
  it('declares what is approved and set: reading issues, a permission, its settings', () => {
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
      events: [],
      actions: [{ name: 'timeEntry.log' }],
    });
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
