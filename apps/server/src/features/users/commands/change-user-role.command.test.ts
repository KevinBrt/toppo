import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq, sql } from 'drizzle-orm';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../../platform/auth/actor.ts';
import { lockInstanceAccounts } from '../../../platform/auth/administrators.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices, waitingForRowLocks } from '../../../test-helpers.ts';
import { changeUserRole } from './change-user-role.command.ts';

const context = setupTestDatabase();
const { users } = schema;

const ADMINISTRATOR_PERMISSIONS: Actor['permissions'] = [
  'instance.users.manage',
  'instance.roles.manage',
];

function executionContext(
  actorId: string,
  permissions: Actor['permissions'] = ADMINISTRATOR_PERMISSIONS,
): ExecutionContext {
  return {
    db: context.database.db,
    actor: { id: actorId, name: 'Admin', email: 'admin@example.com', permissions },
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

async function insertUser(instanceRoleId: string): Promise<string> {
  const id = uuidv7();
  await context.database.db
    .insert(users)
    .values({ id, name: `User ${id}`, email: `${id}@example.com`, instanceRoleId });
  return id;
}

const insertAdministrator = () => insertUser(DEFAULT_ROLE_IDS.administrator);

/** Connections of this test database waiting for an advisory lock. */
async function waitingForAdvisoryLock(): Promise<number> {
  const [row] = await context.database.db.execute<{ count: string }>(
    sql`select count(*) as count from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock' and wait_event = 'advisory'`,
  );
  return Number(row?.count);
}

describe('changeUserRole', () => {
  it('refuses to change one’s own role', async () => {
    const ada = await insertAdministrator();

    await expect(
      changeUserRole.execute(executionContext(ada), { userId: ada, roleId: DEFAULT_ROLE_IDS.team }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_CHANGE_OWN_ROLE' });
  });

  it('keeps the system role out of reach of those who only manage members', async () => {
    const manager = await insertUser(DEFAULT_ROLE_IDS.team);
    const member = await insertUser(DEFAULT_ROLE_IDS.team);
    const admin = await insertAdministrator();
    const asManager = executionContext(manager, ['instance.users.manage']);

    await expect(
      changeUserRole.execute(asManager, { userId: member, roleId: DEFAULT_ROLE_IDS.administrator }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });
    await expect(
      changeUserRole.execute(asManager, { userId: admin, roleId: DEFAULT_ROLE_IDS.team }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });
    await expect(
      changeUserRole.execute(asManager, { userId: member, roleId: DEFAULT_ROLE_IDS.requester }),
    ).resolves.toBeUndefined();
  });

  it('waits for a concurrent change of administrators, then takes it into account', async () => {
    // Ada and Alan are the only administrators.
    await context.database.db
      .update(users)
      .set({ instanceRoleId: DEFAULT_ROLE_IDS.team })
      .where(eq(users.instanceRoleId, DEFAULT_ROLE_IDS.administrator));
    const ada = await insertAdministrator();
    const alan = await insertAdministrator();
    let alanDemotesAda: Promise<void> | undefined;

    await context.database.db.transaction(async (tx) => {
      // Ada's change is under way: Alan is demoted but not committed yet…
      await lockInstanceAccounts(tx, ada);
      await tx
        .update(users)
        .set({ instanceRoleId: DEFAULT_ROLE_IDS.team })
        .where(eq(users.id, alan));
      // …when Alan, still an administrator a moment ago, tries to demote Ada.
      alanDemotesAda = changeUserRole.execute(executionContext(alan), {
        userId: ada,
        roleId: DEFAULT_ROLE_IDS.team,
      });
      alanDemotesAda.catch(() => undefined);
      await expect.poll(waitingForAdvisoryLock).toBe(1);
    });

    await expect(alanDemotesAda).rejects.toMatchObject({
      statusCode: 409,
      code: 'LAST_ADMINISTRATOR',
    });
    const administrators = await context.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.instanceRoleId, DEFAULT_ROLE_IDS.administrator));
    expect(administrators).toStrictEqual([{ id: ada }]);
  });

  it('waits for the role being deleted, then finds it gone', async () => {
    const roleId = uuidv7();
    await context.database.db.insert(schema.roles).values({ id: roleId, name: 'Temporary' });
    const member = await insertUser(DEFAULT_ROLE_IDS.team);
    const admin = await insertAdministrator();
    let roleChange: Promise<void> | undefined;

    await context.database.db.transaction(async (tx) => {
      // The role is being deleted…
      await tx.delete(schema.roles).where(eq(schema.roles.id, roleId));
      // …when an administrator gives it to a member.
      roleChange = changeUserRole.execute(executionContext(admin), { userId: member, roleId });
      roleChange.catch(() => undefined);
      await expect.poll(() => waitingForRowLocks(context.database)).toBe(1);
    });

    await expect(roleChange).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_ROLE' });
  });
});
