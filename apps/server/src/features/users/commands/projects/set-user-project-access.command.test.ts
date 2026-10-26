import { DEFAULT_ROLE_IDS } from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../../test-helpers.ts';
import { setUserProjectAccess } from './set-user-project-access.command.ts';

const context = setupTestDatabase();
let manager: Actor;
let widerManager: Actor;
let administrator: Actor;
let memberId: string;

function executionContext(actor: Actor): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

async function insertUser(instanceRoleId: string, allProjects = false): Promise<string> {
  const id = uuidv7();
  await context.database.db
    .insert(schema.users)
    .values({ id, name: `User ${id}`, email: `${id}@example.com`, instanceRoleId, allProjects });
  return id;
}

async function insertActor(
  instanceRoleId: string,
  allProjects = false,
  permissions: Actor['permissions'] = ['instance.users.manage'],
): Promise<Actor> {
  const id = await insertUser(instanceRoleId, allProjects);
  return { id, name: `User ${id}`, email: `${id}@example.com`, permissions };
}

async function allProjectsOf(userId: string): Promise<boolean | undefined> {
  const [row] = await context.database.db
    .select({ allProjects: schema.users.allProjects })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return row?.allProjects;
}

beforeAll(async () => {
  // Both manage members through a custom role; only the second reaches every project.
  manager = await insertActor(DEFAULT_ROLE_IDS.team);
  widerManager = await insertActor(DEFAULT_ROLE_IDS.team, true);
  administrator = await insertActor(DEFAULT_ROLE_IDS.administrator, false, [
    'instance.users.manage',
    'instance.roles.manage',
  ]);
  memberId = await insertUser(DEFAULT_ROLE_IDS.requester);
});

describe('access to every project', () => {
  it('is given or taken only by someone who reaches every project', async () => {
    for (const allProjects of [true, false]) {
      await expect(
        setUserProjectAccess.execute(executionContext(manager), { userId: memberId, allProjects }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'ALL_PROJECTS_RESERVED' });
    }
    expect(await allProjectsOf(memberId)).toBe(false);

    await setUserProjectAccess.execute(executionContext(widerManager), {
      userId: memberId,
      allProjects: true,
    });
    expect(await allProjectsOf(memberId)).toBe(true);

    await setUserProjectAccess.execute(executionContext(administrator), {
      userId: memberId,
      allProjects: false,
    });
    expect(await allProjectsOf(memberId)).toBe(false);
  });

  it('is never changed by its holder on themselves', async () => {
    for (const actor of [manager, widerManager, administrator]) {
      await expect(
        setUserProjectAccess.execute(executionContext(actor), {
          userId: actor.id,
          allProjects: true,
        }),
      ).rejects.toMatchObject({ statusCode: 403, code: 'ALL_PROJECTS_RESERVED' });
    }
    expect(await allProjectsOf(manager.id)).toBe(false);
    expect(await allProjectsOf(widerManager.id)).toBe(true);
  });
});
