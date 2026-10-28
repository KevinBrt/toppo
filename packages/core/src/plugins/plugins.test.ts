import { describe, expect, it } from 'vitest';
import { asksForMore, isReservedPluginId, type PluginGrants } from './plugins.ts';

describe('plugin ids', () => {
  it.each(['issue', 'comment', 'project', 'instance', 'toppo'])('reserves %s', (id) => {
    expect(isReservedPluginId(id)).toBe(true);
  });

  it.each(['time-tracking', 'issues', 'reports'])('leaves %s to plugins', (id) => {
    expect(isReservedPluginId(id)).toBe(false);
  });
});

describe('a plugin upgrade', () => {
  const approved: PluginGrants = {
    needs: ['issue.read', 'comment.create'],
    permissions: { 'entries.log': { scope: 'project' }, 'reports.read': { scope: 'instance' } },
    events: ['issue.statusChanged'],
  };

  it('asks for nothing more with the same grants, in another order, or fewer', () => {
    expect(asksForMore(approved, approved)).toBe(false);
    expect(
      asksForMore(approved, {
        needs: ['comment.create', 'issue.read'],
        permissions: { 'reports.read': { scope: 'instance' }, 'entries.log': { scope: 'project' } },
        events: ['issue.statusChanged'],
      }),
    ).toBe(false);
    expect(asksForMore(approved, { needs: [], permissions: {}, events: [] })).toBe(false);
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
