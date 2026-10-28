import {
  ALL_PERMISSIONS,
  isPermission,
  PERMISSION_SECTIONS,
  PERMISSIONS,
  type Permission,
  type PermissionScope,
  type PermissionSection,
  permissionsOfRole,
} from '@toppo-tracker/core';
import type { RoleDetails, RolePermissionsRequest } from '@toppo-tracker/shared';

/** How many issues of a project a role lets its members see. */
export const ISSUE_VISIBILITIES = ['none', 'own', 'all'] as const;

export type IssueVisibility = (typeof ISSUE_VISIBILITIES)[number];

const READS_ISSUES = ['issue.read', 'issue.read.own'] as const satisfies readonly Permission[];

/** A permission shown as a switch: any but the two that read issues. */
export type SwitchPermission = Exclude<Permission, (typeof READS_ISSUES)[number]>;

const isSwitchPermission = (permission: Permission): permission is SwitchPermission =>
  !READS_ISSUES.some((reading) => reading === permission);

/**
 * A line of the matrix: a permission, one choice standing for the two that read issues, or
 * whether members are told of new issues, a setting rather than a permission.
 */
export type MatrixRow =
  | { kind: 'permission'; permission: SwitchPermission }
  | { kind: 'issueVisibility' }
  | { kind: 'notifyNewIssues' };

export interface MatrixSection {
  section: PermissionSection | 'notifications';
  scope: PermissionScope;
  rows: readonly MatrixRow[];
}

/** What the matrix edits of a role: its permissions, and whether it is told of new issues. */
export interface RoleSettings {
  permissions: readonly Permission[];
  notifyNewIssues: boolean;
}

export function settingsOfRole(role: RoleDetails): RoleSettings {
  return {
    permissions: permissionsOfRole(role, []).filter(isPermission),
    notifyNewIssues: role.notifyNewIssues,
  };
}

const VISIBILITY: Readonly<Record<IssueVisibility, readonly Permission[]>> = {
  none: [],
  own: ['issue.read.own'],
  // Seeing every issue includes one's own: the default Team role stores both.
  all: READS_ISSUES,
};

/** The sections of the matrix and their rows, in catalog order, then the notifications. */
export const MATRIX_SECTIONS: readonly MatrixSection[] = [
  ...PERMISSION_SECTIONS.map((section) => permissionSection(section)),
  { section: 'notifications', scope: 'project', rows: [{ kind: 'notifyNewIssues' }] },
];

function permissionSection(section: PermissionSection): MatrixSection {
  const permissions = ALL_PERMISSIONS.filter(
    (permission) => PERMISSIONS[permission].section === section,
  );
  return {
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

export function issueVisibilityOf(permissions: readonly Permission[]): IssueVisibility {
  if (permissions.includes('issue.read')) {
    return 'all';
  }
  return permissions.includes('issue.read.own') ? 'own' : 'none';
}

const inCatalogOrder = (permissions: readonly Permission[]) =>
  ALL_PERMISSIONS.filter((permission) => permissions.includes(permission));

/** `permissions` with `permission` granted or not. */
export function withPermission(
  permissions: readonly Permission[],
  permission: Permission,
  granted: boolean,
): Permission[] {
  const others = permissions.filter((candidate) => candidate !== permission);
  return inCatalogOrder(granted ? [...others, permission] : others);
}

/** `permissions` letting members see `visibility` issues. */
export function withIssueVisibility(
  permissions: readonly Permission[],
  visibility: IssueVisibility,
): Permission[] {
  const others = permissions.filter(isSwitchPermission);
  return inCatalogOrder([...others, ...VISIBILITY[visibility]]);
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
      return String(permissions.includes(row.permission));
  }
}

/** How many cells of the matrix differ from what was saved: what "N unsaved changes" counts. */
export function countChanges(drafts: Readonly<Record<string, RoleDraft>>): number {
  const rows = MATRIX_SECTIONS.flatMap(({ rows: sectionRows }) => sectionRows);
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
