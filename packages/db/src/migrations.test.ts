import { randomBytes } from 'node:crypto';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_ROLES,
  DEFAULT_STATUSES,
  DEFAULT_TRANSITIONS,
  DEFAULT_WORKFLOW_ID,
} from '@toppo/core';
import {
  ATTACHMENT_MEDIA_TYPES,
  ATTACHMENT_NAME_MAX_LENGTH,
  ATTACHMENT_SIZE_CEILING,
  LABEL_NAME_MAX_LENGTH,
  PALETTE_COLORS,
} from '@toppo/shared';
import { createEmptyTestDatabase, createTestDatabase, type TestDatabase } from '@toppo/testing';
import { eq, or, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER } from '../vitest.global-setup.ts';
import { createDatabase, type Database } from './database.ts';
import {
  activities,
  attachments,
  comments,
  instanceSettings,
  invitations,
  issueCategories,
  issueLabels,
  issues,
  jobs,
  labels,
  priorities,
  projectMembers,
  projects,
  roles,
  statuses,
  users,
  workflowStatuses,
  workflows,
  workflowTransitions,
} from './schema/index.ts';
import { uuidv7 } from './uuid.ts';

async function appliedMigrations(database: Database): Promise<number> {
  const rows = await database.db.execute<{ count: string }>(
    sql`select count(*) as count from drizzle.__drizzle_migrations`,
  );
  return Number(rows[0]?.count);
}

/**
 * Every migration of the project, twice at once: a few seconds, more with each release, and
 * more again while every package tests at once.
 */
const MIGRATING_TIMEOUT_MS = 30_000;

describe('migrations on an empty database', () => {
  let empty: TestDatabase;
  const databases: Database[] = [];

  beforeAll(async () => {
    empty = await createEmptyTestDatabase();
  });

  afterAll(async () => {
    await Promise.all(databases.map((database) => database.close()));
  });

  it(
    'applies every migration once, even when servers start concurrently',
    async () => {
      const first = createDatabase({ url: empty.url, maxConnections: 2 });
      const second = createDatabase({ url: empty.url, maxConnections: 2 });
      databases.push(first, second);

      await Promise.all([first.migrate(MIGRATIONS_FOLDER), second.migrate(MIGRATIONS_FOLDER)]);

      expect(await appliedMigrations(first)).toBeGreaterThanOrEqual(2);
    },
    MIGRATING_TIMEOUT_MS,
  );

  it(
    'does nothing when run again',
    async () => {
      const [database] = databases;
      if (!database) {
        throw new Error('previous test did not run');
      }
      const before = await appliedMigrations(database);

      await database.migrate(MIGRATIONS_FOLDER);

      expect(await appliedMigrations(database)).toBe(before);
    },
    MIGRATING_TIMEOUT_MS,
  );
});

describe('initial data and constraints', () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 2 });
  });

  afterAll(async () => {
    await database.close();
  });

  it('seeds exactly the default roles of @toppo/core', async () => {
    const seeded = await database.db
      .select({
        id: roles.id,
        name: roles.name,
        grantsAll: roles.grantsAll,
        color: roles.color,
        permissions: roles.permissions,
        notifyNewIssues: roles.notifyNewIssues,
      })
      .from(roles);

    const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);
    expect(seeded.sort(byId)).toStrictEqual(
      DEFAULT_ROLES.map(({ id, name, grantsAll, color, permissions, notifyNewIssues }) => ({
        id,
        name,
        grantsAll,
        color,
        permissions: [...permissions],
        notifyNewIssues,
      })).sort(byId),
    );
  });

  it('creates the instance settings row, waiting for setup', async () => {
    const rows = await database.db.select().from(instanceSettings);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, setupCompletedAt: null });
  });

  it('keeps instance settings to a single row', async () => {
    await expect(database.db.insert(instanceSettings).values({ id: 2 })).rejects.toThrow();
  });

  it('drops the instance name, which the domain already provides', async () => {
    const columns = await database.db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'instance_settings'`,
    );

    expect(columns.map((column) => column.column_name)).not.toContain('name');
  });

  it('creates users active, with the instance role they were given', async () => {
    const [user] = await database.db
      .insert(users)
      .values({
        name: 'Ada',
        email: `ada-${uuidv7()}@example.com`,
        instanceRoleId: DEFAULT_ROLE_IDS.team,
      })
      .returning();

    expect(user?.instanceRoleId).toBe(DEFAULT_ROLE_IDS.team);
    expect(user?.deactivatedAt).toBeNull();
    expect(user?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses a user whose instance role was not chosen', async () => {
    await expect(
      database.db.execute(
        sql`insert into users (id, name, email) values (${uuidv7()}, 'Ada', 'ada@example.com')`,
      ),
    ).rejects.toThrow();
  });

  it('stores emails in lower case only', async () => {
    await expect(
      database.db.insert(users).values({
        name: 'Ada',
        email: 'Ada@Example.com',
        instanceRoleId: DEFAULT_ROLE_IDS.team,
      }),
    ).rejects.toThrow();
  });

  it('refuses two roles with the same name, ignoring case', async () => {
    await expect(database.db.insert(roles).values({ name: 'team' })).rejects.toThrow();
    await expect(database.db.insert(roles).values({ name: 'Reporter' })).resolves.toBeDefined();
  });

  it('refuses an unknown color', async () => {
    await expect(
      database.db.execute(
        sql`insert into roles (id, name, color) values (${uuidv7()}, 'Y', '#f00')`,
      ),
    ).rejects.toThrow();
  });

  it('keeps a single system role', async () => {
    await expect(
      database.db.insert(roles).values({ name: 'Second system role', grantsAll: true }),
    ).rejects.toThrow();
  });

  it('refuses to delete a role a member still holds, even a deactivated one', async () => {
    await database.db.insert(users).values({
      name: 'Grace',
      email: `grace-${uuidv7()}@example.com`,
      instanceRoleId: DEFAULT_ROLE_IDS.requester,
      deactivatedAt: new Date(),
    });

    await expect(
      database.db.delete(roles).where(eq(roles.id, DEFAULT_ROLE_IDS.requester)),
    ).rejects.toThrow();
  });

  it('refuses to delete a role a pending invitation still gives', async () => {
    const [role] = await database.db
      .insert(roles)
      .values({ name: `Invited ${uuidv7()}` })
      .returning({ id: roles.id });
    const roleId = role?.id ?? '';
    await database.db.insert(invitations).values({
      email: `pending-${uuidv7()}@example.com`,
      roleId,
      tokenHash: uuidv7(),
      invitedById: await createInviter(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(database.db.delete(roles).where(eq(roles.id, roleId))).rejects.toThrow();
  });

  it('deletes a role left only in history, clearing it there', async () => {
    const [role] = await database.db
      .insert(roles)
      .values({ name: `Former ${uuidv7()}` })
      .returning({ id: roles.id });
    const roleId = role?.id ?? '';
    const [deleted] = await database.db
      .insert(users)
      .values({
        name: '',
        email: `deleted-${uuidv7()}@deleted.invalid`,
        instanceRoleId: roleId,
        deactivatedAt: new Date(),
        deletedAt: new Date(),
      })
      .returning({ id: users.id });
    const [accepted] = await database.db
      .insert(invitations)
      .values({
        email: `accepted-${uuidv7()}@example.com`,
        roleId,
        tokenHash: uuidv7(),
        invitedById: await createInviter(),
        expiresAt: new Date(Date.now() + 60_000),
        acceptedAt: new Date(),
      })
      .returning({ id: invitations.id });

    await database.db.delete(roles).where(eq(roles.id, roleId));

    const [user] = await database.db
      .select({ roleId: users.instanceRoleId })
      .from(users)
      .where(eq(users.id, deleted?.id ?? ''));
    const [invitation] = await database.db
      .select({ roleId: invitations.roleId })
      .from(invitations)
      .where(eq(invitations.id, accepted?.id ?? ''));
    expect(user?.roleId).toBeNull();
    expect(invitation?.roleId).toBeNull();
  });

  it('refuses a pending invitation without a role', async () => {
    await expect(
      database.db.insert(invitations).values({
        email: `nobody-${uuidv7()}@example.com`,
        tokenHash: uuidv7(),
        invitedById: await createInviter(),
        expiresAt: new Date(Date.now() + 60_000),
      }),
    ).rejects.toThrow();
  });

  async function createInviter(): Promise<string> {
    const [user] = await database.db
      .insert(users)
      .values({
        name: 'Inviter',
        email: `inviter-${uuidv7()}@example.com`,
        instanceRoleId: DEFAULT_ROLE_IDS.administrator,
      })
      .returning({ id: users.id });
    return user?.id ?? '';
  }

  it('keeps one pending invitation per address, and expiries after creation', async () => {
    const [inviter] = await database.db
      .insert(users)
      .values({
        name: 'Inviter',
        email: `inviter-${uuidv7()}@example.com`,
        instanceRoleId: DEFAULT_ROLE_IDS.administrator,
      })
      .returning({ id: users.id });
    const invitation = (tokenHash: string, acceptedAt: Date | null = null) => ({
      email: 'invited@example.com',
      roleId: DEFAULT_ROLE_IDS.team,
      tokenHash,
      invitedById: inviter?.id ?? '',
      expiresAt: new Date(Date.now() + 60_000),
      acceptedAt,
    });

    await database.db.insert(invitations).values(invitation('accepted', new Date()));
    await database.db.insert(invitations).values(invitation('pending'));
    await expect(database.db.insert(invitations).values(invitation('second'))).rejects.toThrow();
    await expect(
      database.db
        .insert(invitations)
        .values({ ...invitation('past'), email: 'past@example.com', expiresAt: new Date(0) }),
    ).rejects.toThrow();
  });

  it('lets a deleted account be only a deactivated one', async () => {
    await expect(
      database.db.insert(users).values({
        name: '',
        email: `deleted-${uuidv7()}@deleted.invalid`,
        instanceRoleId: DEFAULT_ROLE_IDS.team,
        deletedAt: new Date(),
      }),
    ).rejects.toThrow();
  });
});

describe('projects and issues', () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 2 });
  });

  afterAll(async () => {
    await database.close();
  });

  async function createUser(): Promise<string> {
    const [user] = await database.db
      .insert(users)
      .values({
        name: 'Grace',
        email: `grace-${uuidv7()}@example.com`,
        instanceRoleId: DEFAULT_ROLE_IDS.team,
      })
      .returning({ id: users.id, allProjects: users.allProjects });
    expect(user?.allProjects).toBe(false);
    return user?.id ?? '';
  }

  let projectCount = 0;
  async function createProject(): Promise<string> {
    projectCount += 1;
    const [project] = await database.db
      .insert(projects)
      .values({ key: `P${projectCount}`, name: `Project ${projectCount}` })
      .returning({ id: projects.id, nextIssueNumber: projects.nextIssueNumber });
    expect(project?.nextIssueNumber).toBe(1);
    return project?.id ?? '';
  }

  async function createIssue(projectId: string, number: number, title = `Issue ${number}`) {
    const [issue] = await database.db
      .insert(issues)
      .values({
        projectId,
        number,
        title,
        categoryId: DEFAULT_CATEGORIES[0]?.id ?? '',
        statusId: DEFAULT_STATUSES[0]?.id ?? '',
        priorityId: DEFAULT_PRIORITIES[0]?.id ?? '',
        reporterId: await createUser(),
      })
      .returning({ id: issues.id });
    return issue?.id ?? '';
  }

  it('seeds the default workflow, priorities and categories of @toppo/core', async () => {
    const { db } = database;
    const workflowRows = await db
      .select({ id: workflows.id, projectId: workflows.projectId })
      .from(workflows);
    const steps = await db
      .select({
        id: workflowStatuses.id,
        workflowId: workflowStatuses.workflowId,
        statusId: workflowStatuses.statusId,
        isInitial: workflowStatuses.isInitial,
        name: statuses.name,
        closes: statuses.closes,
        color: statuses.color,
        projectId: statuses.projectId,
      })
      .from(workflowStatuses)
      .innerJoin(statuses, eq(statuses.id, workflowStatuses.statusId))
      .orderBy(workflowStatuses.position);
    const priorityRows = await db
      .select({
        id: priorities.id,
        level: priorities.level,
        name: priorities.name,
        isDefault: priorities.isDefault,
      })
      .from(priorities)
      .orderBy(priorities.level);
    const categoryRows = await db
      .select({
        id: issueCategories.id,
        name: issueCategories.name,
        color: issueCategories.color,
        isDefault: issueCategories.isDefault,
      })
      .from(issueCategories)
      .orderBy(issueCategories.position);

    expect(workflowRows).toStrictEqual([{ id: DEFAULT_WORKFLOW_ID, projectId: null }]);
    expect(steps).toStrictEqual(
      DEFAULT_STATUSES.map((status) => ({
        id: status.workflowStatusId,
        workflowId: DEFAULT_WORKFLOW_ID,
        statusId: status.id,
        isInitial: status.initial,
        name: status.name,
        closes: status.closes,
        color: status.color,
        projectId: null,
      })),
    );
    expect(priorityRows).toStrictEqual(
      DEFAULT_PRIORITIES.map(({ id, level, name, isDefault }) => ({ id, level, name, isDefault })),
    );
    expect(categoryRows).toStrictEqual(
      DEFAULT_CATEGORIES.map(({ id, name, color, isDefault }) => ({ id, name, color, isDefault })),
    );
  });

  it('seeds the transitions of the default workflow', async () => {
    const statusOf = (kind: string) => DEFAULT_STATUSES.find((status) => status.kind === kind)?.id;
    const rows = await database.db
      .select({
        id: workflowTransitions.id,
        workflowId: workflowTransitions.workflowId,
        fromStatusId: workflowTransitions.fromStatusId,
        toStatusId: workflowTransitions.toStatusId,
      })
      .from(workflowTransitions);

    const byId = (left: { id: string }, right: { id: string }) => left.id.localeCompare(right.id);
    expect(rows.sort(byId)).toStrictEqual(
      DEFAULT_TRANSITIONS.map(({ id, from, to }) => ({
        id,
        workflowId: DEFAULT_WORKFLOW_ID,
        fromStatusId: statusOf(from),
        toStatusId: statusOf(to),
      })).sort(byId),
    );
  });

  it('keeps transitions between statuses of their workflow, once each, never to the same one', async () => {
    const [outside] = await database.db
      .insert(statuses)
      .values({ name: 'Outside' })
      .returning({ id: statuses.id });
    const [first, second] = DEFAULT_STATUSES;
    const transition = (fromStatusId: string, toStatusId: string) =>
      database.db
        .insert(workflowTransitions)
        .values({ workflowId: DEFAULT_WORKFLOW_ID, fromStatusId, toStatusId });

    await expect(transition(first?.id ?? '', outside?.id ?? '')).rejects.toThrow();
    await expect(transition(first?.id ?? '', first?.id ?? '')).rejects.toThrow();
    await expect(transition(first?.id ?? '', second?.id ?? '')).rejects.toThrow();
  });

  it('takes a status’s transitions out of the workflow with it', async () => {
    const [triage] = await database.db
      .insert(statuses)
      .values({ name: 'Sorting' })
      .returning({ id: statuses.id });
    const triageId = triage?.id ?? '';
    const newId = DEFAULT_STATUSES[0]?.id ?? '';
    await database.db
      .insert(workflowStatuses)
      .values({ workflowId: DEFAULT_WORKFLOW_ID, statusId: triageId, position: 6 });
    await database.db.insert(workflowTransitions).values([
      { workflowId: DEFAULT_WORKFLOW_ID, fromStatusId: newId, toStatusId: triageId },
      { workflowId: DEFAULT_WORKFLOW_ID, fromStatusId: triageId, toStatusId: newId },
    ]);

    await database.db.delete(workflowStatuses).where(eq(workflowStatuses.statusId, triageId));

    const left = await database.db
      .select({ id: workflowTransitions.id })
      .from(workflowTransitions)
      .where(
        or(
          eq(workflowTransitions.fromStatusId, triageId),
          eq(workflowTransitions.toStatusId, triageId),
        ),
      );
    expect(left).toStrictEqual([]);
  });

  it('accepts project keys like WEB or API2 only, each once', async () => {
    for (const key of ['web', 'W', 'WEB_1', '2WEB', 'TOOLONGKEY1']) {
      await expect(
        database.db.insert(projects).values({ key, name: 'Bad key' }),
        key,
      ).rejects.toThrow();
    }
    await database.db.insert(projects).values({ key: 'API2', name: 'API' });
    await expect(
      database.db.insert(projects).values({ key: 'API2', name: 'Again' }),
    ).rejects.toThrow();
  });

  it('gives projects a color of the palette only', async () => {
    await expect(
      database.db.insert(projects).values({ key: 'PINK', name: 'Pink', color: 'pink' }),
    ).resolves.toBeDefined();
    await expect(
      database.db.execute(
        sql`insert into projects (id, key, name, color) values (${uuidv7()}, 'HEX', 'Hex', '#f60')`,
      ),
    ).rejects.toThrow();
  });

  it('keeps one workflow for the instance and at most one copy per project', async () => {
    const projectId = await createProject();

    await expect(database.db.insert(workflows).values({ projectId: null })).rejects.toThrow();
    await database.db.insert(workflows).values({ projectId });
    await expect(database.db.insert(workflows).values({ projectId })).rejects.toThrow();
  });

  it('starts a workflow on a single status', async () => {
    const [triage] = await database.db
      .insert(statuses)
      .values({ name: 'Triage' })
      .returning({ id: statuses.id });

    await expect(
      database.db.insert(workflowStatuses).values({
        workflowId: DEFAULT_WORKFLOW_ID,
        statusId: triage?.id ?? '',
        position: 5,
        isInitial: true,
      }),
    ).rejects.toThrow();
  });

  it('names statuses once per scope, ignoring case', async () => {
    const projectId = await createProject();

    await expect(database.db.insert(statuses).values({ name: 'new' })).rejects.toThrow();
    await database.db.insert(statuses).values({ name: 'New', projectId });
    await expect(database.db.insert(statuses).values({ name: 'NEW', projectId })).rejects.toThrow();
  });

  it('refuses a status or category color it does not know', async () => {
    await expect(
      database.db.execute(
        sql`insert into statuses (id, name, color) values (${uuidv7()}, 'Blocked', 'blocked')`,
      ),
    ).rejects.toThrow();
    await expect(
      database.db.execute(
        sql`insert into issue_categories (id, name, color, position)
            values (${uuidv7()}, 'Sales', '#f00', 3)`,
      ),
    ).rejects.toThrow();
  });

  it('keeps four priority levels, and a single default priority and category', async () => {
    const notDefault = (rows: readonly { id: string; isDefault: boolean }[]) =>
      rows.find(({ isDefault }) => !isDefault)?.id ?? '';

    await expect(
      database.db.insert(priorities).values({ level: 5, name: 'Critical' }),
    ).rejects.toThrow();
    await expect(
      database.db.insert(priorities).values({ level: 2, name: 'Medium' }),
    ).rejects.toThrow();
    await expect(
      database.db
        .update(priorities)
        .set({ isDefault: true })
        .where(eq(priorities.id, notDefault(DEFAULT_PRIORITIES))),
    ).rejects.toThrow();
    await expect(
      database.db
        .update(issueCategories)
        .set({ isDefault: true })
        .where(eq(issueCategories.id, notDefault(DEFAULT_CATEGORIES))),
    ).rejects.toThrow();
    await expect(
      database.db.insert(issueCategories).values({ name: 'bug', position: 3 }),
    ).rejects.toThrow();
  });

  it('numbers issues once per project, with a title of reasonable length', async () => {
    const first = await createProject();
    const second = await createProject();
    await createIssue(first, 1);
    await createIssue(second, 1);

    await expect(createIssue(first, 1)).rejects.toThrow();
    await expect(createIssue(first, 0)).rejects.toThrow();
    await expect(createIssue(first, 2, '   ')).rejects.toThrow();
    await expect(createIssue(first, 3, 'x'.repeat(201))).rejects.toThrow();
  });

  it('removes the history of a deleted issue, keeping what is recorded without one', async () => {
    const projectId = await createProject();
    const issueId = await createIssue(projectId, 1);
    const actorId = await createUser();
    await database.db.insert(activities).values([
      { projectId, issueId, actorId, type: 'issue.created' },
      { projectId, issueId: null, actorId, type: 'issue.deleted', payload: { key: 'P1-1' } },
    ]);

    await database.db.delete(issues).where(eq(issues.id, issueId));

    const left = await database.db
      .select({ type: activities.type })
      .from(activities)
      .where(eq(activities.projectId, projectId));
    expect(left).toStrictEqual([{ type: 'issue.deleted' }]);
  });

  it('refuses to delete a role a project gives', async () => {
    const projectId = await createProject();
    const [role] = await database.db
      .insert(roles)
      .values({ name: `Project role ${uuidv7()}` })
      .returning({ id: roles.id });
    const roleId = role?.id ?? '';
    await database.db
      .insert(projectMembers)
      .values({ projectId, userId: await createUser(), roleId });

    await expect(database.db.delete(roles).where(eq(roles.id, roleId))).rejects.toThrow();
  });

  async function createComment(issueId: string): Promise<string> {
    const [comment] = await database.db
      .insert(comments)
      .values({ issueId, authorId: await createUser(), body: 'Here is the export' })
      .returning({ id: comments.id });
    return comment?.id ?? '';
  }

  async function attach(
    issueId: string,
    file: Partial<typeof attachments.$inferInsert> = {},
  ): Promise<string> {
    const [attachment] = await database.db
      .insert(attachments)
      .values({
        issueId,
        uploaderId: await createUser(),
        fileName: 'export.csv',
        mediaType: 'text/csv',
        size: 1024,
        storageKey: randomBytes(32).toString('hex'),
        ...file,
      })
      .returning({ id: attachments.id });
    return attachment?.id ?? '';
  }

  it('keeps a file on its issue, or on a comment of that very issue', async () => {
    const projectId = await createProject();
    const issueId = await createIssue(projectId, 1);
    const otherIssueId = await createIssue(projectId, 2);
    const commentId = await createComment(issueId);

    await attach(issueId);
    await attach(issueId, { commentId });

    await expect(attach(otherIssueId, { commentId })).rejects.toThrow();
  });

  it('accepts the types of @toppo/shared only, of a sane size and name, under a random key', async () => {
    const issueId = await createIssue(await createProject(), 1);
    for (const mediaType of ATTACHMENT_MEDIA_TYPES) {
      await attach(issueId, { mediaType });
    }
    await attach(issueId, {
      fileName: 'x'.repeat(ATTACHMENT_NAME_MAX_LENGTH),
      size: ATTACHMENT_SIZE_CEILING,
    });

    const fileId = await attach(issueId);
    for (const mediaType of ['image/svg+xml', 'text/html', 'application/zip']) {
      await expect(
        database.db
          .update(attachments)
          .set({ mediaType: sql`${mediaType}` })
          .where(eq(attachments.id, fileId)),
      ).rejects.toThrow();
    }
    const refused: Partial<typeof attachments.$inferInsert>[] = [
      { size: 0 },
      { size: ATTACHMENT_SIZE_CEILING + 1 },
      { fileName: '   ' },
      { fileName: 'x'.repeat(ATTACHMENT_NAME_MAX_LENGTH + 1) },
      { storageKey: '../../etc/passwd' },
      { storageKey: randomBytes(32).toString('hex').toUpperCase() },
    ];
    for (const file of refused) {
      await expect(attach(issueId, file)).rejects.toThrow();
    }
    const storageKey = randomBytes(32).toString('hex');
    await attach(issueId, { storageKey });
    await expect(attach(issueId, { storageKey })).rejects.toThrow();
  });

  it('removes files with their comment, and with their issue', async () => {
    const projectId = await createProject();
    const issueId = await createIssue(projectId, 1);
    const commentId = await createComment(issueId);
    const onRequest = await attach(issueId);
    await attach(issueId, { commentId });

    await database.db.delete(comments).where(eq(comments.id, commentId));
    const left = await database.db
      .select({ id: attachments.id })
      .from(attachments)
      .where(eq(attachments.issueId, issueId));
    expect(left).toStrictEqual([{ id: onRequest }]);

    await database.db.delete(issues).where(eq(issues.id, issueId));
    expect(
      await database.db.select().from(attachments).where(eq(attachments.issueId, issueId)),
    ).toStrictEqual([]);
  });

  async function createLabel(name: string, color?: (typeof PALETTE_COLORS)[number]) {
    const [label] = await database.db
      .insert(labels)
      .values({ name, ...(color ? { color } : {}) })
      .returning({ id: labels.id });
    return label?.id ?? '';
  }

  it('names labels once whatever the case, briefly, in a color of the palette', async () => {
    for (const color of PALETTE_COLORS) {
      await createLabel(`Regression ${color}`, color);
    }
    await createLabel('x'.repeat(LABEL_NAME_MAX_LENGTH));

    await expect(createLabel('regression GRAY')).rejects.toThrow();
    await expect(createLabel('   ')).rejects.toThrow();
    await expect(createLabel('x'.repeat(LABEL_NAME_MAX_LENGTH + 1))).rejects.toThrow();
    const label = await createLabel('Security');
    await expect(
      database.db.update(labels).set({ color: sql`'red'` }).where(eq(labels.id, label)),
    ).rejects.toThrow();
  });

  it('tags an issue once with a label, until the issue or the label goes', async () => {
    const projectId = await createProject();
    const issueId = await createIssue(projectId, 1);
    const other = await createIssue(projectId, 2);
    const mobile = await createLabel('Mobile');
    const billing = await createLabel('Billing');
    await database.db.insert(issueLabels).values([
      { issueId, labelId: mobile },
      { issueId, labelId: billing },
      { issueId: other, labelId: mobile },
    ]);

    await expect(
      database.db.insert(issueLabels).values({ issueId, labelId: mobile }),
    ).rejects.toThrow();
    await database.db.delete(labels).where(eq(labels.id, billing));
    await database.db.delete(issues).where(eq(issues.id, other));

    const left = await database.db
      .select({ issueId: issueLabels.issueId, labelId: issueLabels.labelId })
      .from(issueLabels)
      .where(or(eq(issueLabels.issueId, issueId), eq(issueLabels.issueId, other)));
    expect(left).toStrictEqual([{ issueId, labelId: mobile }]);
  });
});

describe('the job queue', () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 2 });
  });

  afterAll(async () => {
    await database.close();
  });

  it('keeps one pending job per key, however many failed before', async () => {
    const job = { type: 'files.sweep', uniqueKey: 'files.sweep' };
    await database.db.insert(jobs).values({ ...job, status: 'failed' });
    await database.db.insert(jobs).values({ ...job, status: 'failed' });
    await database.db.insert(jobs).values(job);

    await expect(database.db.insert(jobs).values(job)).rejects.toThrow();
    await database.db.insert(jobs).values({ type: 'files.sweep' });
    await database.db.insert(jobs).values({ type: 'files.sweep' });
  });

  it('refuses a job without a type, an unknown status, or counts below their bounds', async () => {
    await expect(database.db.insert(jobs).values({ type: '  ' })).rejects.toThrow();
    await expect(database.db.insert(jobs).values({ type: 'x', attempts: -1 })).rejects.toThrow();
    await expect(database.db.insert(jobs).values({ type: 'x', maxAttempts: 0 })).rejects.toThrow();
    await expect(
      database.db.insert(jobs).values({ type: 'x', status: sql`'running'` }),
    ).rejects.toThrow();
  });
});
