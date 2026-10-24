import { type Permission, permissionsOfRole, rolePermissionsFrom } from '@toppo/core';
import { schema } from '@toppo/db';
import { type RolePermissionsRequest, rolePermissionsRequestSchema } from '@toppo/shared';
import { eq, inArray } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { roles } = schema;

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  const rightSet = new Set(right);
  return new Set(left).size === rightSet.size && left.every((value) => rightSet.has(value));
}

/**
 * Saves what the matrix changed, for every role at once or not at all: permissions, and whether
 * members are told of new issues, which the system role, its permissions locked, may change too.
 * A role someone else changed since the matrix was loaded is not overwritten: the whole save is
 * refused.
 */
export const updateRolePermissions = defineCommand({
  name: 'role.updatePermissions',
  access: { permission: 'instance.roles.manage' },
  input: rolePermissionsRequestSchema,
  async handler({ tx, actor, log }, { changes }): Promise<void> {
    const roleIds = changes.map(({ roleId }) => roleId);
    // Locked: a concurrent save of the same roles waits, then finds them changed.
    const current = await tx
      .select({
        id: roles.id,
        grantsAll: roles.grantsAll,
        permissions: roles.permissions,
        notifyNewIssues: roles.notifyNewIssues,
      })
      .from(roles)
      .where(inArray(roles.id, roleIds))
      .for('update');

    for (const change of changes) {
      assertApplicable(
        current.find((candidate) => candidate.id === change.roleId),
        change,
      );
    }

    for (const { roleId, to, notifyNewIssues } of changes) {
      const role = current.find((candidate) => candidate.id === roleId);
      await tx
        .update(roles)
        .set({
          ...(role?.grantsAll ? {} : { permissions: rolePermissionsFrom(to).permissions }),
          ...(notifyNewIssues ? { notifyNewIssues: notifyNewIssues.to } : {}),
        })
        .where(eq(roles.id, roleId));
    }
    log.info({ roleIds, by: actor.id }, 'Role permissions changed');
  },
});

type RoleChange = RolePermissionsRequest['changes'][number];

/**
 * Refuses a change that cannot apply: to a role gone, to the permissions of the system role, to
 * permissions no role may hold, or to a role changed since the matrix showed it.
 */
function assertApplicable(
  role: { grantsAll: boolean; permissions: Permission[]; notifyNewIssues: boolean } | undefined,
  { from, to, notifyNewIssues }: RoleChange,
): void {
  if (!role) {
    throw new HttpError(404, 'ROLE_NOT_FOUND', 'This role does not exist');
  }
  if (role.grantsAll && !sameSet(from, to)) {
    throw new HttpError(403, 'SYSTEM_ROLE_LOCKED', 'The system role cannot be changed');
  }
  if (!role.grantsAll && rolePermissionsFrom(to).refused.length > 0) {
    throw new HttpError(400, 'INVALID_PERMISSIONS', 'A role cannot be given these');
  }
  const changedMeanwhile =
    !sameSet(permissionsOfRole(role), from) ||
    (notifyNewIssues !== undefined && notifyNewIssues.from !== role.notifyNewIssues);
  if (changedMeanwhile) {
    throw new HttpError(409, 'ROLES_CHANGED', 'Someone else changed these roles meanwhile');
  }
}
