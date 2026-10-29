import { SUPPORTED_LOCALES } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  isInstancePermission,
  isPermission,
  isProjectPermission,
  PERMISSION_SECTIONS,
  PERMISSIONS,
  type Permission,
} from './catalog.ts';
import { DEFAULT_ROLE_IDS, DEFAULT_ROLE_NAMES, DEFAULT_ROLES } from './default-roles.ts';
import { canBeGranted, permissionsOfRole } from './grants.ts';

describe('permission catalog', () => {
  it('names every permission resource.action', () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it('recognizes catalog entries only', () => {
    expect(isPermission('issue.update')).toBe(true);
    expect(isPermission('issue.fly')).toBe(false);
    expect(isPermission('toString')).toBe(false);
  });

  it('applies the organisation section to the whole instance, the rest inside projects', () => {
    for (const permission of ALL_PERMISSIONS) {
      const organisation = PERMISSIONS[permission].section === 'organisation';
      expect(isInstancePermission(permission), permission).toBe(organisation);
      expect(isProjectPermission(permission), permission).toBe(!organisation);
    }
    expect(isProjectPermission('issue.fly')).toBe(false);
  });

  it('lists permissions section by section, in display order', () => {
    const sections = ALL_PERMISSIONS.map((permission) => PERMISSIONS[permission].section);
    const order = sections.map((section) => PERMISSION_SECTIONS.indexOf(section));

    expect(order).toStrictEqual([...order].sort((left, right) => left - right));
  });

  it('lets no role but the system one manage roles, the email server, plugins or webhooks', () => {
    expect(ALL_PERMISSIONS.filter((permission) => !canBeGranted(permission))).toStrictEqual([
      'instance.mail.manage',
      'instance.roles.manage',
      'instance.plugins.manage',
      'instance.webhooks.manage',
    ]);
  });
});

describe('default roles', () => {
  it('store only permissions a role may be given', () => {
    for (const role of DEFAULT_ROLES) {
      for (const permission of role.permissions) {
        expect(canBeGranted(permission), `${role.name}: ${permission}`).toBe(true);
      }
    }
  });

  it('have unique ids and names, and a single system role', () => {
    expect(new Set(DEFAULT_ROLES.map((role) => role.id)).size).toBe(DEFAULT_ROLES.length);
    expect(new Set(DEFAULT_ROLES.map((role) => role.name)).size).toBe(DEFAULT_ROLES.length);
    expect(Object.values(DEFAULT_ROLE_IDS).sort()).toStrictEqual(
      DEFAULT_ROLES.map((role) => role.id).sort(),
    );
    expect(DEFAULT_ROLES.filter((role) => role.grantsAll).map((role) => role.id)).toStrictEqual([
      DEFAULT_ROLE_IDS.administrator,
    ]);
  });

  it('are named in every supported language, distinctly', () => {
    for (const locale of SUPPORTED_LOCALES) {
      const names = Object.values(DEFAULT_ROLE_NAMES[locale]);
      expect(
        names.every((name) => name.trim() !== ''),
        locale,
      ).toBe(true);
      expect(new Set(names.map((name) => name.toLowerCase())).size, locale).toBe(names.length);
    }
    expect(DEFAULT_ROLES.map((role) => role.name)).toStrictEqual(
      DEFAULT_ROLES.map((role) => DEFAULT_ROLE_NAMES.en[role.kind]),
    );
  });

  // The matrix of ARCHITECTURE.md, written out so that any change to it is deliberate.
  const MATRIX: Record<Permission, [administrator: boolean, team: boolean, requester: boolean]> = {
    'issue.read': [true, true, false],
    'issue.read.own': [true, true, true],
    'issue.create': [true, true, true],
    'issue.update': [true, true, false],
    'issue.assign': [true, true, false],
    'issue.delete': [true, false, false],
    'comment.create': [true, true, true],
    'comment.moderate': [true, false, false],
    'project.settings.manage': [true, false, false],
    'project.members.manage': [true, false, false],
    'instance.users.manage': [true, false, false],
    'project.create': [true, false, false],
    'project.delete': [true, false, false],
    'instance.settings.manage': [true, false, false],
    'instance.mail.manage': [true, false, false],
    'instance.roles.manage': [true, false, false],
    'instance.plugins.manage': [true, false, false],
    'instance.webhooks.manage': [true, false, false],
  };

  it.each(ALL_PERMISSIONS)('grant %s as documented', (permission) => {
    const granted = (['administrator', 'team', 'requester'] as const).map((kind) => {
      const role = DEFAULT_ROLES.find((candidate) => candidate.kind === kind);
      return role ? permissionsOfRole(role, []).includes(permission) : undefined;
    });
    expect(granted).toStrictEqual(MATRIX[permission]);
  });
});
