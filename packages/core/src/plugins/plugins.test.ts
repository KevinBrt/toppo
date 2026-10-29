import { describe, expect, it } from 'vitest';
import { asksForMore, isReservedPluginId, type PluginGrants, pluginUserOf } from './plugins.ts';

describe('plugin ids', () => {
  it.each(['issue', 'comment', 'project', 'instance', 'toppo'])('reserves %s', (id) => {
    expect(isReservedPluginId(id)).toBe(true);
  });

  it.each(['time-tracking', 'issues', 'reports'])('leaves %s to plugins', (id) => {
    expect(isReservedPluginId(id)).toBe(false);
  });
});

describe("a plugin's own user", () => {
  it('is named after its id, with an address that reaches no one', () => {
    expect(pluginUserOf('time-tracking')).toStrictEqual({
      name: 'Time tracking',
      email: 'time-tracking@plugins.invalid',
    });
    expect(pluginUserOf('a1--b2').name).toBe('A1 b2');
  });
});

describe('a plugin upgrade', () => {
  const approved: PluginGrants = {
    needs: ['issue.read', 'comment.create'],
    permissions: { 'entries.log': { scope: 'project' }, 'reports.read': { scope: 'instance' } },
    events: ['issue.statusChanged'],
    properties: { timeSpent: {} },
    jobs: [{ name: 'weeklySummary' }],
    http: ['hooks.slack.com'],
  };

  it('asks for nothing more with the same grants, in another order, or fewer', () => {
    expect(asksForMore(approved, approved)).toBe(false);
    expect(
      asksForMore(approved, {
        needs: ['comment.create', 'issue.read'],
        permissions: { 'reports.read': { scope: 'instance' }, 'entries.log': { scope: 'project' } },
        events: ['issue.statusChanged'],
        properties: { timeSpent: { type: 'number' } },
        jobs: [{ name: 'weeklySummary' }],
        http: ['hooks.slack.com'],
      }),
    ).toBe(false);
    expect(
      asksForMore(approved, {
        needs: [],
        permissions: {},
        events: [],
        properties: {},
        jobs: [],
        http: null,
      }),
    ).toBe(false);
  });

  it.each([
    ['the same hosts', ['hooks.slack.com'], ['hooks.slack.com']],
    ['fewer hosts', ['hooks.slack.com', 'api.toggl.com'], ['hooks.slack.com']],
    ['the same settings', { fromSettings: ['url', 'other'] }, { fromSettings: ['other'] }],
    ['anything, any site approved', 'any', { fromSettings: ['url'] }],
    ['nothing at all', { fromSettings: ['url'] }, null],
  ] as const)('reaches no more with %s', (_, before, after) => {
    expect(asksForMore({ ...approved, http: before }, { ...approved, http: after })).toBe(false);
  });

  it.each([
    ['a host', ['hooks.slack.com'], ['hooks.slack.com', 'api.toggl.com']],
    ['a setting', { fromSettings: ['url'] }, { fromSettings: ['url', 'other'] }],
    ['a setting, hosts approved', ['hooks.slack.com'], { fromSettings: ['url'] }],
    ['hosts, settings approved', { fromSettings: ['url'] }, ['hooks.slack.com']],
    ['anywhere, from nowhere', null, ['hooks.slack.com']],
    ['any site', ['hooks.slack.com'], 'any'],
  ] as const)('reaches more with %s', (_, before, after) => {
    expect(asksForMore({ ...approved, http: before }, { ...approved, http: after })).toBe(true);
  });

  it('asks for no more when a permission narrows to projects', () => {
    expect(
      asksForMore(approved, {
        ...approved,
        permissions: { ...approved.permissions, 'reports.read': { scope: 'project' } },
      }),
    ).toBe(false);
  });

  it.each([
    ['a need', { ...approved, needs: [...approved.needs, 'issue.update'] }],
    ['an event', { ...approved, events: [...approved.events, 'issue.created'] }],
    ['a property', { ...approved, properties: { ...approved.properties, estimate: {} } }],
    ['a job', { ...approved, jobs: [...approved.jobs, { name: 'dailyCheck' }] }],
    [
      'a permission',
      {
        ...approved,
        permissions: { ...approved.permissions, 'entries.edit': { scope: 'project' } },
      },
    ],
    [
      'a permission in the whole instance',
      {
        ...approved,
        permissions: { ...approved.permissions, 'entries.log': { scope: 'instance' } },
      },
    ],
  ])('asks for more with %s', (_, upgrade: PluginGrants) => {
    expect(asksForMore(approved, upgrade)).toBe(true);
  });
});
