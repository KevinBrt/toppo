import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { createInvitations } from './create-invitations.command.ts';
import { renewInvitation } from './renew-invitation.command.ts';
import { revokeInvitation } from './revoke-invitation.command.ts';

const context = setupTestDatabase();
let manager: Actor;
let administrator: Actor;

function executionContext(actor: Actor): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

async function insertActor(
  instanceRoleId: string,
  permissions: Actor['permissions'],
  allProjects = false,
) {
  const id = uuidv7();
  await context.database.db
    .insert(schema.users)
    .values({ id, name: `User ${id}`, email: `${id}@example.com`, instanceRoleId, allProjects });
  return { id, name: `User ${id}`, email: `${id}@example.com`, permissions };
}

beforeAll(async () => {
  // Manages members through a custom role, without holding the system role.
  manager = await insertActor(DEFAULT_ROLE_IDS.team, ['instance.users.manage']);
  administrator = await insertActor(DEFAULT_ROLE_IDS.administrator, [
    'instance.users.manage',
    'instance.roles.manage',
  ]);
});

describe('invitations to the system role', () => {
  it('are for administrators to send', async () => {
    await expect(
      createInvitations.execute(executionContext(manager), {
        emails: ['boss@example.com'],
        roleId: DEFAULT_ROLE_IDS.administrator,
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'SYSTEM_ROLE_RESERVED' });

    await expect(
      createInvitations.execute(executionContext(manager), {
        emails: ['colleague@example.com'],
        roleId: DEFAULT_ROLE_IDS.team,
      }),
    ).resolves.toMatchObject({ alreadyMembers: [] });
  });

  it('are for administrators to renew or revoke', async () => {
    const { invitations } = await createInvitations.execute(executionContext(administrator), {
      emails: ['deputy@example.com'],
      roleId: DEFAULT_ROLE_IDS.administrator,
    });
    const invitationId = invitations[0]?.id ?? '';

    await expect(
      renewInvitation.execute(executionContext(manager), { invitationId }),
    ).rejects.toMatchObject({ code: 'SYSTEM_ROLE_RESERVED' });
    await expect(
      revokeInvitation.execute(executionContext(manager), { invitationId }),
    ).rejects.toMatchObject({ code: 'SYSTEM_ROLE_RESERVED' });
    await expect(
      revokeInvitation.execute(executionContext(administrator), { invitationId }),
    ).resolves.toBeUndefined();
  });
});

describe('invitations to every project', () => {
  it('are sent only by someone who reaches every project', async () => {
    const invite = (actor: Actor, email: string) =>
      createInvitations.execute(executionContext(actor), {
        emails: [email],
        roleId: DEFAULT_ROLE_IDS.team,
        allProjects: true,
      });
    const widerManager = await insertActor(DEFAULT_ROLE_IDS.team, ['instance.users.manage'], true);

    await expect(invite(manager, 'wide@example.com')).rejects.toMatchObject({
      statusCode: 403,
      code: 'ALL_PROJECTS_RESERVED',
    });
    await expect(invite(widerManager, 'wide@example.com')).resolves.toMatchObject({
      alreadyMembers: [],
    });
    await expect(invite(administrator, 'wider@example.com')).resolves.toMatchObject({
      alreadyMembers: [],
    });
  });
});

describe('renewing an invitation', () => {
  it('is for those who reach every project it opens, since its link gives them', async () => {
    const { db } = context.database;
    const [web, hr] = [uuidv7(), uuidv7()];
    await db.insert(schema.projects).values([
      { id: web, key: 'RNW', name: 'Website' },
      { id: hr, key: 'RNH', name: 'Human resources' },
    ]);
    await db.insert(schema.projectMembers).values({ projectId: web, userId: manager.id });
    const sent = async (access: { projectKeys?: string[]; allProjects?: boolean }) => {
      const { invitations } = await createInvitations.execute(executionContext(administrator), {
        emails: [`${uuidv7()}@example.com`],
        roleId: DEFAULT_ROLE_IDS.team,
        ...access,
      });
      return invitations[0]?.id ?? '';
    };
    const renew = async (access: { projectKeys?: string[]; allProjects?: boolean }) =>
      renewInvitation.execute(executionContext(manager), { invitationId: await sent(access) });

    await expect(renew({ projectKeys: ['RNH'] })).rejects.toMatchObject({
      statusCode: 403,
      code: 'INVITATION_BEYOND_REACH',
    });
    await expect(renew({ projectKeys: ['RNW', 'RNH'] })).rejects.toMatchObject({
      code: 'INVITATION_BEYOND_REACH',
    });
    await expect(renew({ allProjects: true })).rejects.toMatchObject({
      statusCode: 403,
      code: 'ALL_PROJECTS_RESERVED',
    });
    await expect(renew({ projectKeys: ['RNW'] })).resolves.toMatchObject({
      link: expect.stringContaining('#'),
    });
    await expect(renew({})).resolves.toMatchObject({ link: expect.stringContaining('#') });
  });
});
