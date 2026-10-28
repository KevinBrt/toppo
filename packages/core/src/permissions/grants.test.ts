import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, type PluginPermission } from './catalog.ts';
import {
  can,
  canAny,
  instancePermissionsOf,
  permissionsOfRole,
  rolePermissionsFrom,
  scopeOf,
} from './grants.ts';

describe('can', () => {
  it('allows exactly the granted permissions', () => {
    const granted = ['instance.users.manage', 'project.create'];

    expect(can(granted, 'instance.users.manage')).toBe(true);
    expect(can(granted, 'instance.roles.manage')).toBe(false);
    expect(can([], 'project.create')).toBe(false);
  });
});

describe('canAny', () => {
  it('allows when at least one permission is granted', () => {
    const granted = ['instance.roles.manage'];

    expect(canAny(granted, ['instance.users.manage', 'instance.roles.manage'])).toBe(true);
    expect(canAny(granted, ['instance.users.manage', 'instance.settings.manage'])).toBe(false);
    expect(canAny(granted, [])).toBe(false);
  });
});

const role = (permissions: string[]) => ({ grantsAll: false, permissions });

/** Two permissions of an approved plugin, after Toppo's own in the catalog. */
const PLUGINS: readonly PluginPermission[] = [
  { name: 'time-tracking.entries.log', scope: 'project' },
  { name: 'time-tracking.reports.read', scope: 'instance' },
];

describe('permissionsOfRole', () => {
  it('gives the system role every permission, Toppo’s then the plugins’, whatever it stores', () => {
    expect(permissionsOfRole({ grantsAll: true, permissions: [] }, PLUGINS)).toStrictEqual([
      ...ALL_PERMISSIONS,
      'time-tracking.entries.log',
      'time-tracking.reports.read',
    ]);
  });

  it('keeps what a role stores, a plugin’s permissions after Toppo’s', () => {
    expect(
      permissionsOfRole(
        role(['time-tracking.reports.read', 'issue.read', 'instance.users.manage']),
        PLUGINS,
      ),
    ).toStrictEqual(['issue.read', 'instance.users.manage', 'time-tracking.reports.read']);
  });

  it('ignores permissions the catalog does not know now: a plugin removed or not approved', () => {
    expect(
      permissionsOfRole(role(['plugin.removed', 'toString', 'issue.read']), PLUGINS),
    ).toStrictEqual(['issue.read']);
    expect(permissionsOfRole(role(['time-tracking.entries.log']), [])).toStrictEqual([]);
  });

  it('never lets a stored value grant what only the system role has', () => {
    expect(permissionsOfRole(role(['instance.roles.manage']), PLUGINS)).toStrictEqual([]);
  });
});

describe('rolePermissionsFrom', () => {
  it('keeps each grantable permission once, in catalog order', () => {
    expect(
      rolePermissionsFrom(
        ['time-tracking.entries.log', 'comment.create', 'issue.read', 'comment.create'],
        PLUGINS,
      ),
    ).toStrictEqual({
      permissions: ['issue.read', 'comment.create', 'time-tracking.entries.log'],
      refused: [],
    });
  });

  it('refuses unknown permissions, those of no plugin approved, and those only the system role holds', () => {
    expect(
      rolePermissionsFrom(
        ['issue.read', 'issue.fly', 'instance.roles.manage', 'issue.fly', 'reports.entries.log'],
        PLUGINS,
      ),
    ).toStrictEqual({
      permissions: ['issue.read'],
      refused: ['issue.fly', 'instance.roles.manage', 'reports.entries.log'],
    });
  });
});

describe('scopeOf', () => {
  it('tells where a permission applies, Toppo’s by its catalog, a plugin’s as it declared', () => {
    expect(scopeOf('project.create', PLUGINS)).toBe('instance');
    expect(scopeOf('issue.read', PLUGINS)).toBe('project');
    expect(scopeOf('time-tracking.reports.read', PLUGINS)).toBe('instance');
    expect(scopeOf('time-tracking.entries.log', PLUGINS)).toBe('project');
    expect(scopeOf('time-tracking.entries.log', [])).toBeUndefined();
  });
});

describe('instancePermissionsOf', () => {
  it('keeps the permissions that apply in the whole instance, in catalog order', () => {
    expect(
      instancePermissionsOf(
        role([
          'issue.read',
          'project.create',
          'time-tracking.entries.log',
          'time-tracking.reports.read',
          'instance.users.manage',
        ]),
        PLUGINS,
      ),
    ).toStrictEqual(['instance.users.manage', 'project.create', 'time-tracking.reports.read']);
  });
});
