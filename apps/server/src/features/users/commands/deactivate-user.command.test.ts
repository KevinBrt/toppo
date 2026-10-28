import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { deactivateUser } from './deactivate-user.command.ts';

const context = setupTestDatabase();
/** The only administrator of the instance. */
let adminId: string;

function executionContext(actor: Actor): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

/** May manage members, without holding the system role. */
const userManager = (id: string): Actor => ({
  id,
  name: 'Manager',
  email: 'manager@example.com',
  permissions: ['instance.users.manage'],
  pluginPermissions: [],
});

/** Holds every permission without being a member, as a plugin or a job might. */
const SYSTEM_CALLER: Actor = {
  id: '01a1569b-9900-7000-8000-00000000cafe',
  name: 'System',
  email: 'system@example.com',
  permissions: ['instance.users.manage', 'instance.roles.manage'],
  pluginPermissions: [],
};

async function insertUser(instanceRoleId: string): Promise<string> {
  const id = uuidv7();
  await context.database.db
    .insert(schema.users)
    .values({ id, name: `User ${id}`, email: `${id}@example.com`, instanceRoleId });
  return id;
}

async function deactivatedAt(userId: string): Promise<Date | null | undefined> {
  const [user] = await context.database.db
    .select({ deactivatedAt: schema.users.deactivatedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return user?.deactivatedAt;
}

beforeAll(async () => {
  adminId = await insertUser(DEFAULT_ROLE_IDS.administrator);
});

describe('deactivateUser', () => {
  it('refuses to deactivate one’s own account', async () => {
    await expect(
      deactivateUser.execute(executionContext(userManager(adminId)), { userId: adminId }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DEACTIVATE_SELF' });
    expect(await deactivatedAt(adminId)).toBeNull();
  });

  it('leaves administrators to administrators', async () => {
    const managerId = await insertUser(DEFAULT_ROLE_IDS.team);

    await expect(
      deactivateUser.execute(executionContext(userManager(managerId)), { userId: adminId }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });
    expect(await deactivatedAt(adminId)).toBeNull();
  });

  it('never deactivates the last administrator, even for a caller holding every permission', async () => {
    await expect(
      deactivateUser.execute(executionContext(SYSTEM_CALLER), { userId: adminId }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_ADMINISTRATOR' });
    expect(await deactivatedAt(adminId)).toBeNull();
  });

  it('keeps the first deactivation date when asked twice', async () => {
    const userId = await insertUser(DEFAULT_ROLE_IDS.team);
    const run = () => deactivateUser.execute(executionContext(userManager(adminId)), { userId });

    await run();
    const first = await deactivatedAt(userId);
    await run();

    expect(first).toBeInstanceOf(Date);
    expect(await deactivatedAt(userId)).toStrictEqual(first);
  });
});
