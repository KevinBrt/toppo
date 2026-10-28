import { schema, uuidv7 } from '@toppo-tracker/db';
import { describe, expect, it } from 'vitest';
import {
  setupTestDatabase,
  testExecutionContext,
  waitingForRowLocks,
} from '../../../test-helpers.ts';
import { createRole } from './create-role.command.ts';

const context = setupTestDatabase();
const { roles } = schema;

describe('createRole', () => {
  it('waits for a concurrent creation, then sees the name it took', async () => {
    const asAdministrator = testExecutionContext(context.database, {
      id: uuidv7(),
      permissions: ['instance.roles.manage'],
    });
    let secondCreation: Promise<{ id: string }> | undefined;

    await context.database.db.transaction(async (tx) => {
      // A first creation is under way…
      await tx.select({ id: roles.id }).from(roles).for('update');
      await tx.insert(roles).values({ name: 'Supervisor' });
      // …when a second administrator creates a role with the same name.
      secondCreation = createRole.execute(asAdministrator, { name: 'supervisor', color: 'gray' });
      secondCreation.catch(() => undefined);
      await expect.poll(() => waitingForRowLocks(context.database)).toBe(1);
    });

    await expect(secondCreation).rejects.toMatchObject({
      statusCode: 409,
      code: 'ROLE_NAME_TAKEN',
    });
  });
});
