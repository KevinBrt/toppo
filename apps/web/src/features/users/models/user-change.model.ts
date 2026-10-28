import type { MemberRow, RoleBadge } from '@toppo-tracker/shared';

/** What an administrator does to an account from the members screen. */
export type UserChange =
  | { type: 'changeRole'; userId: string; roleId: string }
  | { type: 'deactivate'; userId: string }
  | { type: 'reactivate'; userId: string }
  | { type: 'delete'; userId: string };

/** A page as it will be once the server accepts `change`: shown at once, rolled back if not. */
export function applyUserChange(
  rows: readonly MemberRow[],
  change: UserChange,
  roles: readonly RoleBadge[],
  now: Date,
): MemberRow[] {
  if (change.type === 'delete') {
    return rows.filter((row) => row.id !== change.userId);
  }
  return rows.map((row) =>
    row.type === 'member' && row.id === change.userId ? changed(row, change, roles, now) : row,
  );
}

function changed(
  member: Extract<MemberRow, { type: 'member' }>,
  change: Exclude<UserChange, { type: 'delete' }>,
  roles: readonly RoleBadge[],
  now: Date,
): MemberRow {
  switch (change.type) {
    case 'changeRole':
      return { ...member, role: roles.find((role) => role.id === change.roleId) ?? member.role };
    case 'deactivate':
      return { ...member, deactivatedAt: now.toISOString() };
    case 'reactivate':
      return { ...member, deactivatedAt: null };
  }
}
