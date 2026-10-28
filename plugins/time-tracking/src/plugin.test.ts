import { createTestToppo } from '@toppo-tracker/plugin-testing';
import { describe, expect, it } from 'vitest';
import './actions/log-time.action.ts';
import { plugin } from './plugin.ts';

describe('the time tracking plugin', () => {
  it('declares what an administrator approves: reading issues, one permission, one action', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest).toMatchObject({
      id: 'time-tracking',
      logo: 'logo.png',
      needs: ['issue.read'],
      permissions: { 'entries.log': { scope: 'project', label: 'permissions.log' } },
      events: [],
      actions: [{ name: 'timeEntry.log' }],
    });
  });

  it('names itself and its permission in English and French', () => {
    const { manifest } = createTestToppo(plugin);

    expect(manifest.messages.en).toMatchObject({
      plugin: { name: 'Time tracking' },
      permissions: { log: 'Log time' },
    });
    expect(manifest.messages.fr).toMatchObject({
      plugin: { name: 'Suivi du temps' },
      permissions: { log: 'Saisir du temps' },
    });
  });
});
