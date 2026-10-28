import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  setupTestDatabase,
  testExecutionContext,
  waitingForRowLocks,
} from '../../../test-helpers.ts';
import { updateRolePermissions } from './update-role-permissions.command.ts';

const context = setupTestDatabase();
const { roles } = schema;

const asAdministrator = () =>
  testExecutionContext(context.database, { id: uuidv7(), permissions: ['instance.roles.manage'] });

describe('updateRolePermissions', () => {
  it('waits for a concurrent save of the same role, then refuses to overwrite it', async () => {
    const roleId = uuidv7();
    await context.database.db.insert(roles).values({ id: roleId, name: 'Reviewer' });
    let secondSave: Promise<void> | undefined;

    await context.database.db.transaction(async (tx) => {
      // A first administrator's save is under way…
      await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, roleId)).for('update');
      await tx
        .update(roles)
        .set({ permissions: ['issue.read'] })
        .where(eq(roles.id, roleId));
      // …when a second one saves from the same starting point.
      secondSave = updateRolePermissions.execute(asAdministrator(), {
        changes: [{ roleId, from: [], to: ['issue.create'] }],
      });
      secondSave.catch(() => undefined);
      await expect.poll(() => waitingForRowLocks(context.database)).toBe(1);
    });

    await expect(secondSave).rejects.toMatchObject({ statusCode: 409, code: 'ROLES_CHANGED' });
    const [role] = await context.database.db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, roleId));
    expect(role?.permissions).toStrictEqual(['issue.read']);
  });
});
