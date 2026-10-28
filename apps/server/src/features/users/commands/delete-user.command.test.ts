import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { listMembers } from '../queries/list-members.query.ts';
import { changeUserRole } from './change-user-role.command.ts';
import { deleteUser } from './delete-user.command.ts';
import { reactivateUser } from './reactivate-user.command.ts';

const context = setupTestDatabase();
const { accounts, invitations, sessions, users } = schema;
let administrator: Actor;

function executionContext(actor: Actor): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

async function insertMember(instanceRoleId: string, email = `${uuidv7()}@example.com`) {
  const id = uuidv7();
  await context.database.db
    .insert(users)
    .values({ id, name: 'Joan Clarke', email, instanceRoleId });
  await context.database.db
    .insert(accounts)
    .values({ accountId: id, providerId: 'credential', userId: id, password: 'hash' });
  await context.database.db
    .insert(sessions)
    .values({ token: uuidv7(), userId: id, expiresAt: new Date(Date.now() + 60_000) });
  return id;
}

const asAdministrator = () => executionContext(administrator);

beforeAll(async () => {
  const id = await insertMember(DEFAULT_ROLE_IDS.administrator, 'admin@example.com');
  administrator = {
    id,
    name: 'Admin',
    email: 'admin@example.com',
    permissions: ['instance.users.manage', 'instance.roles.manage'],
    pluginPermissions: [],
  };
});

describe('deleteUser', () => {
  it('erases the name, the address, the password and the sessions, and keeps a row', async () => {
    const userId = await insertMember(DEFAULT_ROLE_IDS.team, 'joan@example.com');

    await deleteUser.execute(asAdministrator(), { userId });

    const [row] = await context.database.db.select().from(users).where(eq(users.id, userId));
    expect(row).toMatchObject({
      name: '',
      email: `deleted-${userId}@deleted.invalid`,
      image: null,
    });
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(row?.deactivatedAt).toBeInstanceOf(Date);
    const db = context.database.db;
    expect(await db.select().from(accounts).where(eq(accounts.userId, userId))).toStrictEqual([]);
    expect(await db.select().from(sessions).where(eq(sessions.userId, userId))).toStrictEqual([]);
  });

  it('frees the address: no account holds it anymore', async () => {
    const holders = await context.database.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, 'joan@example.com'));

    expect(holders).toStrictEqual([]);
  });

  it('leaves no way back: a deleted member is not found anymore', async () => {
    const userId = await insertMember(DEFAULT_ROLE_IDS.team);
    await deleteUser.execute(asAdministrator(), { userId });

    for (const attempt of [
      () => deleteUser.execute(asAdministrator(), { userId }),
      () => reactivateUser.execute(asAdministrator(), { userId }),
      () =>
        changeUserRole.execute(asAdministrator(), { userId, roleId: DEFAULT_ROLE_IDS.requester }),
    ]) {
      await expect(attempt()).rejects.toMatchObject({ statusCode: 404, code: 'USER_NOT_FOUND' });
    }
  });

  it('takes the member out of the list, and their invitations out of their name', async () => {
    const inviterId = await insertMember(DEFAULT_ROLE_IDS.team, 'inviter@example.com');
    await context.database.db.insert(invitations).values({
      email: 'invitee@example.com',
      roleId: DEFAULT_ROLE_IDS.team,
      tokenHash: uuidv7(),
      invitedById: inviterId,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await deleteUser.execute(asAdministrator(), { userId: inviterId });

    const list = await listMembers.execute(asAdministrator(), {});
    expect(list.rows.some((row) => row.id === inviterId)).toBe(false);
    expect(list.rows.find((row) => row.email === 'invitee@example.com')).toMatchObject({
      type: 'invitation',
      invitedBy: null,
    });
  });

  it('refuses to delete one’s own account', async () => {
    await expect(
      deleteUser.execute(asAdministrator(), { userId: administrator.id }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'CANNOT_DELETE_SELF' });
  });

  it('leaves administrators to administrators, and never deletes the last one', async () => {
    const managerId = await insertMember(DEFAULT_ROLE_IDS.team);
    const manager: Actor = {
      ...administrator,
      id: managerId,
      permissions: ['instance.users.manage'],
    };
    const systemCaller: Actor = { ...administrator, id: uuidv7() };

    await expect(
      deleteUser.execute(executionContext(manager), { userId: administrator.id }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });
    await expect(
      deleteUser.execute(executionContext(systemCaller), { userId: administrator.id }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'LAST_ADMINISTRATOR' });
  });
});
