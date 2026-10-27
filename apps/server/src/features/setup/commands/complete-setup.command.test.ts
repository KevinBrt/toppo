import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIELD_NAMES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_NAMES,
  DEFAULT_ROLES,
  DEFAULT_STATUSES,
} from '@toppo/core';
import { schema } from '@toppo/db';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import { setupTestDatabase, testServices } from '../../../test-helpers.ts';
import { completeSetup } from './complete-setup.command.ts';

const context = setupTestDatabase();
const SETUP_CODE = 'ABCD-EFGH-JKLM';

function executionContext(): ExecutionContext {
  return {
    db: context.database.db,
    actor: null,
    log: Fastify({ logger: false }).log,
    services: testServices({
      hashPassword: (password) => Promise.resolve(`hashed:${password}`),
      setupCode: SETUP_CODE,
    }),
  };
}

describe('completeSetup', () => {
  it('names the default roles in the administrator’s language', async () => {
    await completeSetup.execute(executionContext(), {
      setupCode: SETUP_CODE,
      admin: { name: 'Ada', email: 'ada@example.com', password: 'correct horse battery staple' },
      locale: 'fr',
    });

    const roles = await context.database.db
      .select({ id: schema.roles.id, name: schema.roles.name })
      .from(schema.roles);
    for (const role of DEFAULT_ROLES) {
      expect(roles.find(({ id }) => id === role.id)?.name).toBe(DEFAULT_ROLE_NAMES.fr[role.kind]);
    }
  });

  it('names the default statuses, priorities and categories in that language too', async () => {
    const { db } = context.database;
    const { statuses, priorities, issueCategories } = schema;
    const namesById = (rows: { id: string; name: string }[]) =>
      new Map(rows.map(({ id, name }) => [id, name]));
    const statusNames = namesById(
      await db.select({ id: statuses.id, name: statuses.name }).from(statuses),
    );
    const priorityNames = namesById(
      await db.select({ id: priorities.id, name: priorities.name }).from(priorities),
    );
    const categoryNames = namesById(
      await db.select({ id: issueCategories.id, name: issueCategories.name }).from(issueCategories),
    );
    const french = DEFAULT_FIELD_NAMES.fr;

    expect(DEFAULT_STATUSES.map(({ id }) => statusNames.get(id))).toStrictEqual(
      DEFAULT_STATUSES.map(({ kind }) => french.statuses[kind]),
    );
    expect(DEFAULT_PRIORITIES.map(({ id }) => priorityNames.get(id))).toStrictEqual(
      DEFAULT_PRIORITIES.map(({ kind }) => french.priorities[kind]),
    );
    expect(DEFAULT_CATEGORIES.map(({ id }) => categoryNames.get(id))).toStrictEqual(
      DEFAULT_CATEGORIES.map(({ kind }) => french.categories[kind]),
    );
  });

  it('gives the administrator’s account that language, which the interface then speaks', async () => {
    const [admin] = await context.database.db
      .select({ locale: schema.users.locale })
      .from(schema.users);

    expect(admin?.locale).toBe('fr');
  });

  it('stores the hash produced by the password service, never the password', async () => {
    const [account] = await context.database.db.select().from(schema.accounts);

    expect(account?.password).toBe('hashed:correct horse battery staple');
  });
});
