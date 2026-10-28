import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { reactivateUser } from './reactivate-user.command.ts';

const context = setupTestDatabase();

const USER_MANAGER: Actor = {
  id: '01a1569b-9900-7000-8000-00000000beef',
  name: 'Manager',
  email: 'manager@example.com',
  permissions: ['instance.users.manage'],
  pluginPermissions: [],
};

function executionContext(actor: Actor): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

async function insertDeactivatedUser(instanceRoleId: string): Promise<string> {
  const id = uuidv7();
  await context.database.db.insert(schema.users).values({
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    instanceRoleId,
    deactivatedAt: new Date(),
  });
  return id;
}

describe('reactivateUser', () => {
  it('brings a member back', async () => {
    const userId = await insertDeactivatedUser(DEFAULT_ROLE_IDS.team);

    await expect(
      reactivateUser.execute(executionContext(USER_MANAGER), { userId }),
    ).resolves.toBeUndefined();
  });

  it('leaves administrators to administrators', async () => {
    const userId = await insertDeactivatedUser(DEFAULT_ROLE_IDS.administrator);

    await expect(
      reactivateUser.execute(executionContext(USER_MANAGER), { userId }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });
  });
});
