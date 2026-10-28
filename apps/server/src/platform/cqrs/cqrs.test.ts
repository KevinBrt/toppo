import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_STATUSES,
  type Permission,
} from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import { eq } from 'drizzle-orm';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { setupTestDatabase, testServices } from '../../test-helpers.ts';
import type { Actor } from '../auth/actor.ts';
import { HttpError } from '../http/http-error.ts';
import { RequestValidationError } from '../http/zod.ts';
import { defineCommand, defineQuery, type ExecutionContext } from './cqrs.ts';

const context = setupTestDatabase();

const ADA: Actor = {
  id: '01a1569b-9900-7000-8000-000000000001',
  name: 'Ada',
  email: 'ada@example.com',
  permissions: ['project.create'],
  pluginPermissions: [],
};

function executionContext(actor: Actor | null = null): ExecutionContext {
  return {
    db: context.database.db,
    actor,
    log: Fastify({ logger: false }).log,
    services: testServices(),
  };
}

const createRole = defineCommand({
  name: 'role.create',
  access: 'authenticated',
  input: z.object({ name: z.string().min(1), failAfterInsert: z.boolean().default(false) }),
  async handler({ tx }, { name, failAfterInsert }) {
    const [role] = await tx
      .insert(schema.roles)
      .values({ name })
      .returning({ id: schema.roles.id });
    if (failAfterInsert) {
      throw new Error('something failed after the insert');
    }
    return { id: role?.id };
  },
});

async function roleNamed(name: string) {
  return await context.database.db.select().from(schema.roles).where(eq(schema.roles.name, name));
}

describe('defineCommand', () => {
  it('runs the handler with validated input and returns its result', async () => {
    const result = await createRole.execute(executionContext(ADA), { name: 'Contractor' });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await roleNamed('Contractor')).toHaveLength(1);
  });

  it('rolls everything back when the handler fails', async () => {
    await expect(
      createRole.execute(executionContext(ADA), { name: 'Half done', failAfterInsert: true }),
    ).rejects.toThrow('something failed after the insert');

    expect(await roleNamed('Half done')).toHaveLength(0);
  });

  it('refuses anonymous callers before looking at their input', async () => {
    const error = await createRole.execute(executionContext(null), { name: '' }).catch((e) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });

  it('validates input on every call, not only behind HTTP routes', async () => {
    const error = await createRole.execute(executionContext(ADA), { name: '' }).catch((e) => e);

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error.validationContext).toBe('input');
  });
});

describe('operations behind a permission', () => {
  const listUsers = defineQuery({
    name: 'user.list',
    access: { permission: 'instance.users.manage' },
    input: z.object({ limit: z.number().int() }),
    handler: () => Promise.resolve('listed'),
  });

  it('refuse an actor without the permission before looking at their input', async () => {
    const error = await listUsers.execute(executionContext(ADA), { limit: 0.5 }).catch((e) => e);

    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('refuse anonymous callers as unauthenticated', async () => {
    const error = await listUsers.execute(executionContext(null), { limit: 1 }).catch((e) => e);

    expect(error).toMatchObject({ statusCode: 401, code: 'UNAUTHENTICATED' });
  });

  it('run for an actor whose role grants the permission', async () => {
    const admin: Actor = { ...ADA, permissions: ['instance.users.manage'] };

    expect(await listUsers.execute(executionContext(admin), { limit: 1 })).toBe('listed');
  });

  it('expose their access, for the route that runs them', () => {
    expect(listUsers.access).toStrictEqual({ permission: 'instance.users.manage' });
  });
});

describe('defineQuery', () => {
  it('reads without a transaction, with parsed input', async () => {
    const handler = vi.fn(async ({ db }, { name }: { name: string }) => {
      const rows = await db.select().from(schema.roles).where(eq(schema.roles.name, name));
      return rows.length;
    });
    const countRoles = defineQuery({
      name: 'role.count',
      access: 'public',
      input: z.object({ name: z.string().trim() }),
      handler,
    });

    expect(await countRoles.execute(executionContext(), { name: '  Contractor ' })).toBe(1);
    expect(handler.mock.calls[0]?.[0]).not.toHaveProperty('tx');
  });
});

describe('operations about a project', () => {
  const db = () => context.database.db;

  async function insertRole(permissions: Permission[]): Promise<string> {
    const [role] = await db()
      .insert(schema.roles)
      .values({ name: `Role ${uuidv7()}`, permissions })
      .returning({ id: schema.roles.id });
    return role?.id ?? '';
  }

  async function insertActor(roleId: string, allProjects = false): Promise<Actor> {
    const id = uuidv7();
    await db()
      .insert(schema.users)
      .values({
        id,
        name: 'Grace',
        email: `${id}@example.com`,
        instanceRoleId: roleId,
        allProjects,
      });
    return {
      id,
      name: 'Grace',
      email: `${id}@example.com`,
      permissions: [],
      pluginPermissions: [],
    };
  }

  async function insertProject(key: string, archived = false): Promise<string> {
    const [project] = await db()
      .insert(schema.projects)
      .values({ key, name: key, archivedAt: archived ? new Date() : null })
      .returning({ id: schema.projects.id });
    return project?.id ?? '';
  }

  async function join(projectId: string, userId: string, roleId: string | null = null) {
    await db().insert(schema.projectMembers).values({ projectId, userId, roleId });
  }

  async function insertIssue(projectId: string, number: number, reporterId: string) {
    const [status] = DEFAULT_STATUSES;
    const [category] = DEFAULT_CATEGORIES;
    const [priority] = DEFAULT_PRIORITIES;
    await db()
      .insert(schema.issues)
      .values({
        projectId,
        number,
        title: 'An issue',
        statusId: status?.id ?? '',
        categoryId: category?.id ?? '',
        priorityId: priority?.id ?? '',
        reporterId,
      });
  }

  const createIssue = defineCommand({
    name: 'issue.create',
    access: { project: 'projectKey', permission: 'issue.create' },
    input: z.object({ projectKey: z.string() }),
    handler: ({ project }) => Promise.resolve(project),
  });
  const readIssue = defineQuery({
    name: 'issue.get',
    access: { project: 'issueKey' },
    input: z.object({ issueKey: z.string() }),
    handler: ({ project }) => Promise.resolve(project.issue.key),
  });
  const unarchive = defineCommand({
    name: 'project.unarchive',
    access: { project: 'projectKey', permission: 'project.settings.manage', evenArchived: true },
    input: z.object({ projectKey: z.string() }),
    handler: () => Promise.resolve('unarchived'),
  });

  it('hide a project from who cannot reach it, as if it did not exist', async () => {
    await insertProject('HIDDEN');
    const outsider = await insertActor(await insertRole(['issue.create']));

    for (const projectKey of ['HIDDEN', 'NOWHERE']) {
      await expect(
        createIssue.execute(executionContext(outsider), { projectKey }),
      ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    }
  });

  it('apply the role the project gives, instead of the member’s own', async () => {
    const projectId = await insertProject('GIVEN');
    const member = await insertActor(await insertRole(['issue.create']));
    await join(projectId, member.id, await insertRole(['issue.read']));
    const other = await insertActor(await insertRole([]));
    await join(projectId, other.id, await insertRole(['issue.create']));

    await expect(
      createIssue.execute(executionContext(member), { projectKey: 'GIVEN' }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    await expect(
      createIssue.execute(executionContext(other), { projectKey: 'GIVEN' }),
    ).resolves.toMatchObject({ id: projectId, key: 'GIVEN', permissions: ['issue.create'] });
  });

  it('let in members given every project, with their own role', async () => {
    await insertProject('EVERY');
    const everywhere = await insertActor(await insertRole(['issue.create']), true);

    await expect(
      createIssue.execute(executionContext(everywhere), { projectKey: 'EVERY' }),
    ).resolves.toMatchObject({ key: 'EVERY' });
  });

  it('keep every permission for the system role, whatever the project gives', async () => {
    const projectId = await insertProject('ADMIN');
    const admin = await insertActor(DEFAULT_ROLE_IDS.administrator);
    await join(projectId, admin.id, await insertRole([]));

    await expect(
      createIssue.execute(executionContext(admin), { projectKey: 'ADMIN' }),
    ).resolves.toMatchObject({ key: 'ADMIN' });
  });

  it('find the project and the issue of an issue key', async () => {
    const projectId = await insertProject('KEYS');
    const member = await insertActor(await insertRole(['issue.read']));
    await join(projectId, member.id);
    await insertIssue(projectId, 12, member.id);

    expect(await readIssue.execute(executionContext(member), { issueKey: 'KEYS-12' })).toBe(
      'KEYS-12',
    );
    await expect(
      readIssue.execute(executionContext(member), { issueKey: 'not a key' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
    await expect(
      readIssue.execute(executionContext(member), { issueKey: 'KEYS-13' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ISSUE_NOT_FOUND' });
  });

  it('hide the issues of others from who sees only their own, as if they did not exist', async () => {
    const projectId = await insertProject('OWN');
    const reporter = await insertActor(await insertRole(['issue.read.own']));
    const other = await insertActor(await insertRole(['issue.read.own']));
    await join(projectId, reporter.id);
    await join(projectId, other.id);
    await insertIssue(projectId, 1, reporter.id);

    expect(await readIssue.execute(executionContext(reporter), { issueKey: 'OWN-1' })).toBe(
      'OWN-1',
    );
    await expect(
      readIssue.execute(executionContext(other), { issueKey: 'OWN-1' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'ISSUE_NOT_FOUND' });
  });

  it('keep an archived project read-only, unless the command says otherwise', async () => {
    const projectId = await insertProject('OLD', true);
    const member = await insertActor(await insertRole([]));
    await join(
      projectId,
      member.id,
      await insertRole(['issue.read', 'issue.create', 'project.settings.manage']),
    );
    await insertIssue(projectId, 1, member.id);

    expect(await readIssue.execute(executionContext(member), { issueKey: 'OLD-1' })).toBe('OLD-1');
    await expect(
      createIssue.execute(executionContext(member), { projectKey: 'OLD' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'PROJECT_ARCHIVED' });
    expect(await unarchive.execute(executionContext(member), { projectKey: 'OLD' })).toBe(
      'unarchived',
    );
  });

  it('never trust a project checked for another key', async () => {
    await insertProject('MINE');
    const outsider = await insertActor(await insertRole(['issue.create']));
    const checkedElsewhere = {
      ...executionContext(outsider),
      project: { id: uuidv7(), key: 'OTHER', archived: false, permissions: ['issue.create'] },
    } satisfies ExecutionContext;

    await expect(
      createIssue.execute(checkedElsewhere, { projectKey: 'MINE' }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'PROJECT_NOT_FOUND' });
  });
});
