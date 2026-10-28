import type { InstanceAccounts } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { Transaction } from '../cqrs/cqrs.ts';

const { roles, users } = schema;

/** Arbitrary but fixed: identifies changes to who administers the instance. */
const ADMINISTRATION_LOCK_KEY = 7_461_756_324;

/**
 * Locks, for the rest of the transaction, every change that could leave the instance without an
 * administrator, then reads what the rule needs: the active administrators and the member about
 * to change (deleted accounts are gone), never the whole membership. Two administrators demoting
 * each other at the same moment are serialized: the second one sees the first change.
 */
export async function lockInstanceAccounts(
  tx: Transaction,
  memberId: string,
): Promise<InstanceAccounts> {
  await tx.execute(sql`select pg_advisory_xact_lock(${ADMINISTRATION_LOCK_KEY})`);
  const accounts = await tx
    .select({ id: users.id, roleId: roles.id, deactivatedAt: users.deactivatedAt })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.instanceRoleId))
    .where(
      or(
        and(eq(users.id, memberId), isNull(users.deletedAt)),
        and(eq(roles.grantsAll, true), isNull(users.deactivatedAt)),
      ),
    );
  // Roles are a short configuration list. Share-locked: none can be deleted while a member may
  // be given it, so a role deleted meanwhile is reported as such, not as a database error.
  const allRoles = await tx
    .select({ id: roles.id, grantsAll: roles.grantsAll })
    .from(roles)
    .for('key share');
  return {
    users: accounts.map(({ id, roleId, deactivatedAt }) => ({
      id,
      roleId,
      active: deactivatedAt === null,
    })),
    roles: allRoles,
  };
}
