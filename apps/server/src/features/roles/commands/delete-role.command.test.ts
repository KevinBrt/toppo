import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { lockInstanceAccounts } from '../../../platform/auth/administrators.ts';
import {
  setupTestDatabase,
  testExecutionContext,
  waitingForRowLocks,
} from '../../../test-helpers.ts';
import { deleteRole } from './delete-role.command.ts';

const context = setupTestDatabase();
const { roles, users } = schema;

const asAdministrator = () =>
  testExecutionContext(context.database, { id: uuidv7(), permissions: ['instance.roles.manage'] });

async function insertRole(): Promise<string> {
  const id = uuidv7();
  await context.database.db.insert(roles).values({ id, name: `Role ${id}` });
  return id;
}

async function insertMember(instanceRoleId: string): Promise<string> {
  const id = uuidv7();
  await context.database.db
    .insert(users)
    .values({ id, name: `User ${id}`, email: `${id}@example.com`, instanceRoleId });
  return id;
}

describe('deleteRole', () => {
  it('waits for a member being given the role, then refuses', async () => {
    const roleId = await insertRole();
    const member = await insertMember(DEFAULT_ROLE_IDS.team);
    let deletion: Promise<void> | undefined;

    await context.database.db.transaction(async (tx) => {
      // The member is being given the role…
      await lockInstanceAccounts(tx, member);
      await tx.update(users).set({ instanceRoleId: roleId }).where(eq(users.id, member));
      // …when an administrator deletes it.
      deletion = deleteRole.execute(asAdministrator(), { roleId });
      deletion.catch(() => undefined);
      await expect.poll(() => waitingForRowLocks(context.database)).toBe(1);
    });

    await expect(deletion).rejects.toMatchObject({ statusCode: 409, code: 'ROLE_IN_USE' });
  });
});
