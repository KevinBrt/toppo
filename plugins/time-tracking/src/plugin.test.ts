import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import { logTime } from './actions/log-time.action.ts';
import { plugin } from './plugin.ts';

describe('the time tracking plugin', () => {
  it('declares what an administrator approves and sets: reading issues, a permission, a setting', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest).toMatchObject({
      id: 'time-tracking',
      logo: 'logo.png',
      needs: ['issue.read'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      settings: {
        properties: { hoursPerDay: { type: 'number', minimum: 1, maximum: 24, default: 8 } },
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
        .run(logTime, { issueId: issue.id, minutes: 30 }),
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
        .run(logTime, { issueId: issue.id, minutes: 30 }),
    ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });
  });

  it('names itself, its permission and its setting in English and French', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest.messages.en).toMatchObject({
      plugin: { name: 'Time tracking' },
      permissions: { log: 'Log time' },
      settings: { hoursPerDay: { label: 'Hours in a working day' } },
    });
    expect(manifest.messages.fr).toMatchObject({
      plugin: { name: 'Suivi du temps' },
      permissions: { log: 'Saisir du temps' },
      settings: { hoursPerDay: { label: 'Heures dans une journée de travail' } },
    });
  });
});
