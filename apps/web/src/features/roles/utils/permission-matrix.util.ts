import {
  ALL_PERMISSIONS,
  PERMISSION_SECTIONS,
  PERMISSIONS,
  type Permission,
  type PermissionScope,
  type PermissionSection,
  type PluginPermission,
  permissionsOfRole,
} from '@toppo-tracker/core';
import type {
  PluginPermissionSection,
  RoleDetails,
  RolePermissionsRequest,
} from '@toppo-tracker/shared';

/** How many issues of a project a role lets its members see. */
export const ISSUE_VISIBILITIES = ['none', 'own', 'all'] as const;

export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];

const READS_ISSUES: readonly string[] = [
  'issue.read',
  'issue.read.own',
] as const satisfies readonly Permission[];

/** One of Toppo's permissions shown as a switch: any but the two that read issues. */
export type SwitchPermission = Exclude<Permission, 'issue.read' | 'issue.read.own'>;

const isSwitchPermission = (permission: Permission): permission is SwitchPermission =>
  !READS_ISSUES.includes(permission);

/**
 * A line of the matrix: one of Toppo's permissions, one choice standing for the two that read
 * issues, a permission a plugin adds, or whether members are told of new issues, a setting rather
 * than a permission.
 */
export type MatrixRow =
  | { kind: 'permission'; permission: SwitchPermission }
  | {
      kind: 'pluginPermission';
      permission: string;
      scope: PermissionScope;
      /** In the plugin's own words. */
      label: PluginPermissionSection['permissions'][number]['label'];
    }
  | { kind: 'issueVisibility' }
  | { kind: 'notifyNewIssues' };

/** A group of rows: one of Toppo's sections, or a plugin's, named after it. */
export type MatrixSection =
  | {
      kind: 'core';
      section: PermissionSection | 'notifications';
      scope: PermissionScope;
      rows: readonly MatrixRow[];
    }
  | {
      kind: 'plugin';
      slug: string;
      /** In each language: the matrix shows the user's. */
      name: PluginPermissionSection['name'];
      rows: readonly MatrixRow[];
    };

/** The matrix as the server draws it: its sections, and the permissions the plugins add. */
export interface Matrix {
  sections: readonly MatrixSection[];
  plugins: readonly PluginPermission[];
}

/** What the matrix edits of a role: its permissions, and whether it is told of new issues. */
export interface RoleSettings {
  permissions: readonly string[];
  notifyNewIssues: boolean;
}

const VISIBILITY: Readonly<Record<IssueVisibility, readonly string[]>> = {
  none: [],
  own: ['issue.read.own'],
  // Seeing every issue includes one's own: the default Team role stores both.
  all: READS_ISSUES,
};

function permissionSection(section: PermissionSection): MatrixSection {
  const permissions = ALL_PERMISSIONS.filter(
    (permission) => PERMISSIONS[permission].section === section,
  );
  return {
    kind: 'core',
    section,
    scope: permissions.some((permission) => PERMISSIONS[permission].scope === 'project')
      ? 'project'
      : 'instance',
    rows: permissions.flatMap((permission): MatrixRow[] => {
      if (isSwitchPermission(permission)) {
        return [{ kind: 'permission', permission }];
      }
      // Both read permissions make a single row, where the first of them stands.
      return permission === READS_ISSUES[0] ? [{ kind: 'issueVisibility' }] : [];
    }),
  };
}

function pluginSection({ slug, name, permissions }: PluginPermissionSection): MatrixSection {
  return {
    kind: 'plugin',
    slug,
    name,
    rows: permissions.map(({ name: permission, scope, label }) => ({
      kind: 'pluginPermission',
      permission,
      scope,
      label,
    })),
  };
}

const TOPPO_SECTIONS: readonly MatrixSection[] = [
  ...PERMISSION_SECTIONS.map(permissionSection),
  { kind: 'core', section: 'notifications', scope: 'project', rows: [{ kind: 'notifyNewIssues' }] },
];

/** Toppo's sections in catalog order, then the notifications, then one per plugin installed. */
export function matrixOf(plugins: readonly PluginPermissionSection[]): Matrix {
  return {
    sections: [...TOPPO_SECTIONS, ...plugins.map(pluginSection)],
    plugins: plugins.flatMap(({ permissions }) =>
      permissions.map(({ name, scope }) => ({ name, scope })),
    ),
  };
}

export function settingsOfRole(role: RoleDetails, matrix: Matrix): RoleSettings {
  return {
    permissions: permissionsOfRole(role, matrix.plugins),
    notifyNewIssues: role.notifyNewIssues,
  };
}

export function issueVisibilityOf(permissions: readonly string[]): IssueVisibility {
  if (permissions.includes('issue.read')) {
    return 'all';
  }
  return permissions.includes('issue.read.own') ? 'own' : 'none';
}

/** `permissions` in catalog order: Toppo's, then the plugins', as the server lists them. */
const inCatalogOrder = (permissions: readonly string[], matrix: Matrix) =>
  [...ALL_PERMISSIONS, ...matrix.plugins.map(({ name }) => name)].filter((permission) =>
    permissions.includes(permission),
  );

/** `permissions` with `permission` granted or not. */
export function withPermission(
  permissions: readonly string[],
  permission: string,
  granted: boolean,
  matrix: Matrix,
): string[] {
  const others = permissions.filter((candidate) => candidate !== permission);
  return inCatalogOrder(granted ? [...others, permission] : others, matrix);
}

/** `permissions` letting members see `visibility` issues. */
export function withIssueVisibility(
  permissions: readonly string[],
  visibility: IssueVisibility,
  matrix: Matrix,
): string[] {
  const others = permissions.filter((permission) => !READS_ISSUES.includes(permission));
  return inCatalogOrder([...others, ...VISIBILITY[visibility]], matrix);
}

/** A role being edited: what the matrix showed when the edit began, and what it shows now. */
export interface RoleDraft {
  from: RoleSettings;
  to: RoleSettings;
}

function rowValue(row: MatrixRow, { permissions, notifyNewIssues }: RoleSettings): string {
  switch (row.kind) {
    case 'issueVisibility':
      return issueVisibilityOf(permissions);
    case 'notifyNewIssues':
      return String(notifyNewIssues);
    case 'permission':
    case 'pluginPermission':
      return String(permissions.includes(row.permission));
  }
}

/** How many cells of the matrix differ from what was saved: what "N unsaved changes" counts. */
export function countChanges(drafts: Readonly<Record<string, RoleDraft>>, matrix: Matrix): number {
  const rows = matrix.sections.flatMap(({ rows: sectionRows }) => sectionRows);
  return Object.values(drafts).reduce(
    (total, { from, to }) =>
      total + rows.filter((row) => rowValue(row, from) !== rowValue(row, to)).length,
    0,
  );
}

/** The roles to save, each from what the matrix showed to what it shows now. */
export function changesToSave(
  drafts: Readonly<Record<string, RoleDraft>>,
): RolePermissionsRequest['changes'] {
  return Object.entries(drafts).flatMap(([roleId, { from, to }]) => {
    const permissionsChanged = from.permissions.join() !== to.permissions.join();
    const notifyChanged = from.notifyNewIssues !== to.notifyNewIssues;
    if (!(permissionsChanged || notifyChanged)) {
      return [];
    }
    return [
      {
        roleId,
        from: [...from.permissions],
        to: [...to.permissions],
        ...(notifyChanged
          ? { notifyNewIssues: { from: from.notifyNewIssues, to: to.notifyNewIssues } }
          : {}),
      },
    ];
  });
}
