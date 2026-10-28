import { DEFAULT_ROLE_IDS } from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { MEMBERS_PAGE_SIZE, type MemberRow } from '@toppo-tracker/shared';
import Fastify from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { listMembers } from './list-members.query.ts';

const context = setupTestDatabase();
let adminId: string;

const executionContext = (): ExecutionContext => ({
  db: context.database.db,
  actor: {
    id: adminId,
    name: 'Admin',
    email: 'admin@example.com',
    permissions: ['instance.users.manage'],
  },
  log: Fastify({ logger: false }).log,
  services: testServices(),
});

const labelOf = (row: MemberRow) => (row.type === 'member' ? row.name : row.email);

beforeAll(async () => {
  const { db } = context.database;
  adminId = uuidv7();
  await db.insert(schema.users).values([
    {
      id: adminId,
      name: 'Zoé Admin',
      email: 'zoe@altitude.example',
      instanceRoleId: DEFAULT_ROLE_IDS.administrator,
    },
    {
      name: 'Éloïse Martin',
      email: 'eloise@client.example',
      instanceRoleId: DEFAULT_ROLE_IDS.requester,
    },
    {
      name: 'grace Hopper',
      email: 'grace@altitude.example',
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    },
    // Enough team members for a second page.
    ...Array.from({ length: MEMBERS_PAGE_SIZE }, (_, index) => ({
      name: `Team ${String(index).padStart(2, '0')}`,
      email: `team${index}@altitude.example`,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    })),
  ]);
  const invitation = (email: string, acceptedAt: Date | null) => ({
    email,
    roleId: DEFAULT_ROLE_IDS.team,
    tokenHash: uuidv7(),
    invitedById: adminId,
    expiresAt: new Date(Date.now() + 86_400_000),
    acceptedAt,
  });
  await db
    .insert(schema.invitations)
    .values([
      invitation('nina@altitude.example', null),
      invitation('used@example.com', new Date()),
    ]);
});

describe('listMembers', () => {
  it('pages members and pending invitations by role, then by name, case aside', async () => {
    const first = await listMembers.execute(executionContext(), {});
    const second = await listMembers.execute(executionContext(), { page: 2 });

    expect(first.rows).toHaveLength(MEMBERS_PAGE_SIZE);
    expect(first.rows.slice(0, 3).map(labelOf)).toStrictEqual([
      'Zoé Admin',
      'grace Hopper',
      'nina@altitude.example',
    ]);
    expect(second.rows.map(labelOf)).toStrictEqual([
      'Team 47',
      'Team 48',
      'Team 49',
      'Éloïse Martin',
    ]);
    expect(first.matching).toBe(MEMBERS_PAGE_SIZE + 4);
  });

  it('leaves accepted invitations out, and counts the instance whatever the filters', async () => {
    const { rows, totals } = await listMembers.execute(executionContext(), {
      search: 'used@',
    });

    expect(rows).toStrictEqual([]);
    expect(totals).toStrictEqual({ members: MEMBERS_PAGE_SIZE + 3, invitations: 1 });
  });

  it('searches names and addresses, case and accents aside', async () => {
    const byName = await listMembers.execute(executionContext(), { search: 'ELOISE' });
    const byAddress = await listMembers.execute(executionContext(), { search: 'nina@' });

    expect(byName.rows.map(labelOf)).toStrictEqual(['Éloïse Martin']);
    expect(byAddress.rows.map(labelOf)).toStrictEqual(['nina@altitude.example']);
  });

  it('counts the search results of every role, and filters one', async () => {
    const result = await listMembers.execute(executionContext(), {
      search: 'altitude',
      role: DEFAULT_ROLE_IDS.administrator,
    });

    expect(result.rows.map(labelOf)).toStrictEqual(['Zoé Admin']);
    expect(result.matching).toBe(1);
    expect(result.byRole).toStrictEqual({
      [DEFAULT_ROLE_IDS.administrator]: 1,
      [DEFAULT_ROLE_IDS.team]: MEMBERS_PAGE_SIZE + 2,
    });
  });

  it('answers an empty page past the end', async () => {
    const result = await listMembers.execute(executionContext(), { page: 99 });

    expect(result.rows).toStrictEqual([]);
    expect(result.matching).toBe(MEMBERS_PAGE_SIZE + 4);
  });
});
