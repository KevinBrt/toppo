import {
  DEFAULT_CATEGORIES,
  DEFAULT_PRIORITIES,
  DEFAULT_ROLE_IDS,
  DEFAULT_STATUSES,
} from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import {
  apiErrorSchema,
  assignableRolesResponseSchema,
  meResponseSchema,
  projectAccessResponseSchema,
  projectCandidatesResponseSchema,
  projectResponseSchema,
  projectsResponseSchema,
} from '@toppo/shared';
import { and, count, eq, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildTestApp,
  cookieHeader,
  createTestUser,
  setupTestDatabase,
  TEST_SETUP_CODE,
} from '../../test-helpers.ts';

const context = setupTestDatabase();
let app: FastifyInstance;
let adminCookie: string;
let memberCookie: string;
let outsiderCookie: string;
let managerCookie: string;
let adminId: string;
let memberId: string;
let outsiderId: string;
let managerId: string;
/** A role for project managers: they manage members and read issues, nothing more. */
let managerRoleId: string;
let deleterRoleId: string;

const ORIGIN = 'http://localhost:3000';
const PASSWORD = 'correct horse battery staple';

/** Sign-in is rate limited to 5 per minute: this file signs in 4 times in all. */
function signIn(email: string) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sign-in/email',
    headers: { origin: ORIGIN },
    body: { email, password: PASSWORD },
  });
}

function call(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  cookie: string,
  body?: object,
) {
  return app.inject({
    method,
    url,
    headers: { origin: ORIGIN, cookie },
    ...(body ? { body } : {}),
  });
}

const errorCode = (response: { json: () => unknown }) =>
  apiErrorSchema.parse(response.json()).error.code;

async function createProject(key: string, cookie = adminCookie): Promise<void> {
  const response = await call('POST', '/api/v1/projects', cookie, { key, name: `Project ${key}` });
  expect(response.statusCode).toBe(201);
}

async function listKeys(cookie: string, query = ''): Promise<string[]> {
  const response = await call('GET', `/api/v1/projects${query}`, cookie);
  expect(response.statusCode).toBe(200);
  return projectsResponseSchema.parse(response.json()).rows.map(({ key }) => key);
}

async function getProject(key: string, cookie = adminCookie) {
  return projectResponseSchema.parse((await call('GET', `/api/v1/projects/${key}`, cookie)).json());
}

async function join(projectKey: string, userId: string, roleId: string | null = null) {
  const response = await call('POST', `/api/v1/projects/${projectKey}/members`, adminCookie, {
    userIds: [userId],
    roleId,
  });
  expect(response.statusCode).toBe(204);
}

async function managesProjects(cookie: string): Promise<boolean | undefined> {
  const response = await call('GET', '/api/v1/me', cookie);
  return meResponseSchema.parse(response.json()).user?.managesProjects;
}

/** Lets the Team role create projects again, as an administrator may in the matrix. */
async function teamCreatesProjects(allowed: boolean): Promise<void> {
  await context.database.db
    .update(schema.roles)
    .set({
      permissions: allowed
        ? sql`array_append(${schema.roles.permissions}, 'project.create')`
        : sql`array_remove(${schema.roles.permissions}, 'project.create')`,
    })
    .where(eq(schema.roles.id, DEFAULT_ROLE_IDS.team));
}

async function projectIdOf(key: string): Promise<string> {
  const [project] = await context.database.db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.key, key));
  if (!project) {
    throw new Error(`No project ${key}`);
  }
  return project.id;
}

/** A pending invitation, written directly: creating one through the API is rate limited. */
async function invite(
  email: string,
  { projectKey, allProjects = false }: { projectKey?: string; allProjects?: boolean },
): Promise<string> {
  const { db } = context.database;
  const id = uuidv7();
  await db.insert(schema.invitations).values({
    id,
    email,
    roleId: DEFAULT_ROLE_IDS.team,
    tokenHash: id.replaceAll('-', '').padEnd(64, '0'),
    invitedById: adminId,
    expiresAt: new Date(Date.now() + 86_400_000),
    allProjects,
  });
  if (projectKey) {
    await db
      .insert(schema.invitationProjects)
      .values({ invitationId: id, projectId: await projectIdOf(projectKey) });
  }
  return id;
}

beforeAll(async () => {
  app = await buildTestApp({ database: context.database });
  const setup = await app.inject({
    method: 'POST',
    url: '/api/v1/setup',
    body: {
      setupCode: TEST_SETUP_CODE,
      admin: { name: 'Ada Lovelace', email: 'ada@example.com', password: PASSWORD },
    },
  });
  expect(setup.statusCode).toBe(201);
  const { db } = context.database;
  managerRoleId = uuidv7();
  deleterRoleId = uuidv7();
  await db.insert(schema.roles).values([
    { id: managerRoleId, name: 'Manager', permissions: ['issue.read', 'project.members.manage'] },
    { id: deleterRoleId, name: 'Deleter', permissions: ['issue.read', 'issue.delete'] },
  ]);
  const person = (name: string, email: string) =>
    createTestUser(context.database, {
      name,
      email,
      password: PASSWORD,
      instanceRoleId: DEFAULT_ROLE_IDS.team,
    });
  memberId = await person('Grace Hopper', 'grace@example.com');
  outsiderId = await person('Alan Turing', 'alan@example.com');
  managerId = await person('Barbara Liskov', 'barbara@example.com');
  const [admin] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, 'ada@example.com'));
  adminId = admin?.id ?? '';
  adminCookie = cookieHeader(await signIn('ada@example.com'));
  memberCookie = cookieHeader(await signIn('grace@example.com'));
  outsiderCookie = cookieHeader(await signIn('alan@example.com'));
  managerCookie = cookieHeader(await signIn('barbara@example.com'));

  await createProject('WEB');
  await join('WEB', memberId);
  await join('WEB', managerId, managerRoleId);
  return () => app.close();
});

describe('creating and listing projects', () => {
  it('leaves creating projects to administrators by default', async () => {
    const response = await call('POST', '/api/v1/projects', memberCookie, {
      key: 'API',
      name: 'Public API',
    });

    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe('FORBIDDEN');
  });

  it('creates a project its creator has access to, in the next color', async () => {
    await teamCreatesProjects(true);
    await createProject('API', memberCookie);
    await teamCreatesProjects(false);

    expect(await listKeys(memberCookie)).toStrictEqual(['API', 'WEB']);
    expect((await getProject('WEB')).color).toBe('blue');
    expect((await getProject('API')).color).toBe('orange');
  });

  it('refuses a key another project has', async () => {
    const response = await call('POST', '/api/v1/projects', adminCookie, {
      key: 'WEB',
      name: 'Another website',
    });

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('PROJECT_KEY_TAKEN');
  });

  it.each([{ key: 'web', name: 'Lower case' }, { key: 'WEB-2', name: 'Dash' }, { key: 'OK' }])(
    'refuses an invalid project: %j',
    async (body) => {
      const response = await call('POST', '/api/v1/projects', adminCookie, body);

      expect(response.statusCode).toBe(400);
    },
  );

  it('lists only the projects one reaches, filtered in the query', async () => {
    await createProject('HR');

    expect(await listKeys(outsiderCookie)).toStrictEqual([]);
    expect(await listKeys(memberCookie)).toStrictEqual(['API', 'WEB']);
    expect(await listKeys(adminCookie)).toStrictEqual(['API', 'HR', 'WEB']);
    await context.database.db
      .update(schema.users)
      .set({ allProjects: true })
      .where(eq(schema.users.id, outsiderId));
    expect(await listKeys(outsiderCookie)).toStrictEqual(['API', 'HR', 'WEB']);
    await context.database.db
      .update(schema.users)
      .set({ allProjects: false })
      .where(eq(schema.users.id, outsiderId));
  });

  it('lists only the projects one manages on the projects screen, with their members', async () => {
    expect(await listKeys(managerCookie, '?scope=managed')).toStrictEqual(['WEB']);
    // Grace created API, but her own role manages nothing in a project.
    expect(await listKeys(memberCookie, '?scope=managed')).toStrictEqual([]);
    expect(await listKeys(adminCookie, '?scope=managed')).toStrictEqual(['API', 'HR', 'WEB']);

    const response = await call('GET', '/api/v1/projects?scope=managed', managerCookie);
    const [web] = projectsResponseSchema.parse(response.json()).rows;
    expect(web?.members?.count).toBe(3);
    expect(web?.members?.shown.map(({ name }) => name)).toStrictEqual([
      'Ada Lovelace',
      'Barbara Liskov',
      'Grace Hopper',
    ]);
  });

  it('keep who works on a project for those who manage it', async () => {
    const response = await call('GET', '/api/v1/projects', memberCookie);
    const { rows } = projectsResponseSchema.parse(response.json());

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map(({ members, issues }) => ({ members, issues }))).toStrictEqual(
      rows.map(() => ({ members: null, issues: null })),
    );
  });

  it('tells the web app whether one manages a project', async () => {
    expect(await managesProjects(adminCookie)).toBe(true);
    expect(await managesProjects(managerCookie)).toBe(true);
    expect(await managesProjects(memberCookie)).toBe(false);
    expect(await managesProjects(outsiderCookie)).toBe(false);
  });

  it('searches keys and names on the server', async () => {
    expect(await listKeys(adminCookie, '?search=project%20h')).toStrictEqual(['HR']);
    expect(await listKeys(adminCookie, '?search=ap')).toStrictEqual(['API']);
  });
});

describe('a project’s settings', () => {
  it('show a member the project and what they may do in it', async () => {
    expect(await getProject('WEB', memberCookie)).toMatchObject({
      key: 'WEB',
      name: 'Project WEB',
      color: 'blue',
      archived: false,
      keyEditable: true,
      permissions: [
        'issue.read',
        'issue.read.own',
        'issue.create',
        'issue.update',
        'issue.assign',
        'comment.create',
      ],
    });
  });

  it('answer 404 to someone who cannot reach the project, existing or not', async () => {
    for (const key of ['WEB', 'NOWHERE']) {
      const response = await call('GET', `/api/v1/projects/${key}`, outsiderCookie);
      expect(response.statusCode).toBe(404);
      expect(errorCode(response)).toBe('PROJECT_NOT_FOUND');
    }
  });

  it('change the name, the description, the color and the key until the first issue', async () => {
    await createProject('DOCS');
    const renamed = await call('PATCH', '/api/v1/projects/DOCS', adminCookie, {
      key: 'MANUAL',
      name: '  User manual ',
      description: 'How to use Toppo',
      color: 'pink',
    });

    expect(renamed.statusCode).toBe(204);
    expect(await getProject('MANUAL')).toMatchObject({
      name: 'User manual',
      description: 'How to use Toppo',
      color: 'pink',
    });
  });

  it('keep the key once an issue was numbered, and refuse one already taken', async () => {
    await context.database.db
      .update(schema.projects)
      .set({ nextIssueNumber: 2 })
      .where(eq(schema.projects.key, 'MANUAL'));
    const fixed = await call('PATCH', '/api/v1/projects/MANUAL', adminCookie, {
      key: 'GUIDE',
      name: 'User manual',
      description: '',
      color: 'pink',
    });
    const taken = await call('PATCH', '/api/v1/projects/HR', adminCookie, {
      key: 'WEB',
      name: 'People',
      description: '',
      color: 'gray',
    });

    expect(fixed.statusCode).toBe(409);
    expect(errorCode(fixed)).toBe('PROJECT_KEY_FIXED');
    expect(taken.statusCode).toBe(409);
    expect(errorCode(taken)).toBe('PROJECT_KEY_TAKEN');
  });

  it('archive a project: out of the list, read-only, until unarchived', async () => {
    expect((await call('POST', '/api/v1/projects/HR/archive', adminCookie)).statusCode).toBe(204);

    expect(await listKeys(adminCookie)).not.toContain('HR');
    const archived = projectsResponseSchema.parse(
      (await call('GET', '/api/v1/projects?state=archived', adminCookie)).json(),
    );
    expect(archived.rows.map(({ key }) => key)).toStrictEqual(['HR']);
    expect(archived.counts).toStrictEqual({ active: 3, archived: 1 });
    const edit = await call('PATCH', '/api/v1/projects/HR', adminCookie, {
      key: 'HR',
      name: 'People',
      description: '',
      color: 'gray',
    });
    expect(edit.statusCode).toBe(409);
    expect(errorCode(edit)).toBe('PROJECT_ARCHIVED');

    expect((await call('POST', '/api/v1/projects/HR/unarchive', adminCookie)).statusCode).toBe(204);
    expect(await listKeys(adminCookie)).toContain('HR');
  });
});

describe('deleting a project', () => {
  it('needs its own permission, and stays hidden from those who cannot reach it', async () => {
    const member = await call('DELETE', '/api/v1/projects/WEB', memberCookie);
    const outsider = await call('DELETE', '/api/v1/projects/WEB', outsiderCookie);

    expect(member.statusCode).toBe(403);
    expect(errorCode(member)).toBe('FORBIDDEN');
    expect(outsider.statusCode).toBe(404);
    expect(errorCode(outsider)).toBe('PROJECT_NOT_FOUND');
  });

  it('takes its issues, their history and its invitations with it, archived or not', async () => {
    const { db } = context.database;
    await createProject('OLD');
    const projectId = await projectIdOf('OLD');
    const [status] = DEFAULT_STATUSES;
    const [category] = DEFAULT_CATEGORIES;
    const [priority] = DEFAULT_PRIORITIES;
    if (!(status && category && priority)) {
      throw new Error('No default fields');
    }
    const issueId = uuidv7();
    await db.insert(schema.issues).values({
      id: issueId,
      projectId,
      number: 1,
      title: 'Broken link',
      categoryId: category.id,
      statusId: status.id,
      priorityId: priority.id,
      reporterId: adminId,
    });
    await db.insert(schema.activities).values([
      { projectId, issueId, actorId: adminId, type: 'issue.created' },
      { projectId, actorId: adminId, type: 'issue.deleted', payload: { key: 'OLD-2' } },
    ]);
    const invitationId = await invite('olga@example.com', { projectKey: 'OLD' });
    expect((await call('POST', '/api/v1/projects/OLD/archive', adminCookie)).statusCode).toBe(204);

    const deleted = await call('DELETE', '/api/v1/projects/OLD', adminCookie);

    expect(deleted.statusCode).toBe(204);
    expect((await call('GET', '/api/v1/projects/OLD', adminCookie)).statusCode).toBe(404);
    const left = async (table: typeof schema.issues | typeof schema.activities) => {
      const [row] = await db
        .select({ count: count() })
        .from(table)
        .where(eq(table.projectId, projectId));
      return row?.count;
    };
    expect(await left(schema.issues)).toBe(0);
    expect(await left(schema.activities)).toBe(0);
    // The invitation stays, without the project.
    const [invited] = await db
      .select({ count: count() })
      .from(schema.invitationProjects)
      .where(eq(schema.invitationProjects.invitationId, invitationId));
    expect(invited?.count).toBe(0);
  });
});

describe('a project’s access', () => {
  it('lists who reaches it anyway first, then its members, then the invitations', async () => {
    await invite('nina@example.com', { projectKey: 'WEB' });
    await invite('zoe@example.com', { allProjects: true });
    const response = await call('GET', '/api/v1/projects/WEB/access', managerCookie);

    expect(response.statusCode).toBe(200);
    const { rows, matching } = projectAccessResponseSchema.parse(response.json());
    expect(matching).toBe(5);
    expect(
      rows.map((row) =>
        row.kind === 'person'
          ? [row.name, row.access, row.projectRole?.name ?? null]
          : [row.email, row.allProjects],
      ),
    ).toStrictEqual([
      ['Ada Lovelace', 'systemRole', null],
      ['Barbara Liskov', 'member', 'Manager'],
      ['Grace Hopper', 'member', null],
      ['nina@example.com', false],
      ['zoe@example.com', true],
    ]);
  });

  it('searches people and invitations on the server', async () => {
    const response = await call('GET', '/api/v1/projects/WEB/access?search=nina', managerCookie);

    const { rows, matching } = projectAccessResponseSchema.parse(response.json());
    expect(matching).toBe(1);
    expect(rows.map((row) => row.kind)).toStrictEqual(['invitation']);
  });

  it('offer the roles a manager may give: none granting more than they hold', async () => {
    const response = await call('GET', '/api/v1/projects/WEB/roles', managerCookie);

    const roles = assignableRolesResponseSchema.parse(response.json()).roles;
    expect(roles.map(({ id }) => id)).toStrictEqual([managerRoleId]);
  });

  it('suggest people to add: active members who do not reach the project yet', async () => {
    const { db } = context.database;
    await db.insert(schema.users).values({
      name: 'Ann Former',
      email: 'ann@example.com',
      instanceRoleId: DEFAULT_ROLE_IDS.team,
      deactivatedAt: new Date(),
    });
    const candidates = async () => {
      const response = await call('GET', '/api/v1/projects/WEB/candidates?search=a', managerCookie);
      return projectCandidatesResponseSchema.parse(response.json()).people.map(({ name }) => name);
    };

    // Ada reaches every project, Grace and Barbara are in, and Ann is deactivated.
    expect(await candidates()).toStrictEqual(['Alan Turing']);
    await db.update(schema.users).set({ allProjects: true }).where(eq(schema.users.id, outsiderId));
    expect(await candidates()).toStrictEqual([]);
    await db
      .update(schema.users)
      .set({ allProjects: false })
      .where(eq(schema.users.id, outsiderId));
  });

  it('let a manager add someone with a role within theirs, never beyond', async () => {
    const beyond = await call('POST', '/api/v1/projects/WEB/members', managerCookie, {
      userIds: [outsiderId],
      roleId: deleterRoleId,
    });
    const ownRoleBeyond = await call('POST', '/api/v1/projects/WEB/members', managerCookie, {
      userIds: [outsiderId],
      roleId: null,
    });
    const within = await call('POST', '/api/v1/projects/WEB/members', managerCookie, {
      userIds: [outsiderId],
      roleId: managerRoleId,
    });

    expect(beyond.statusCode).toBe(403);
    expect(errorCode(beyond)).toBe('ROLE_BEYOND_YOURS');
    // The Team role creates issues, which the manager may not: it cannot apply here either.
    expect(ownRoleBeyond.statusCode).toBe(403);
    expect(within.statusCode).toBe(204);
    expect((await call('GET', '/api/v1/projects/WEB', outsiderCookie)).statusCode).toBe(200);
  });

  it('give the system role no role of a project: it has every permission anyway', async () => {
    const changed = await call('PATCH', `/api/v1/projects/WEB/members/${adminId}`, adminCookie, {
      roleId: managerRoleId,
    });
    const added = await call('POST', '/api/v1/projects/HR/members', adminCookie, {
      userIds: [adminId],
      roleId: managerRoleId,
    });

    expect(changed.statusCode).toBe(409);
    expect(errorCode(changed)).toBe('SYSTEM_ROLE_HOLDER');
    expect(added.statusCode).toBe(409);
    expect(errorCode(added)).toBe('SYSTEM_ROLE_HOLDER');
  });

  it('change and remove members, never one holding more than the manager there', async () => {
    const onMember = await call(
      'DELETE',
      `/api/v1/projects/WEB/members/${memberId}`,
      managerCookie,
    );
    expect(onMember.statusCode).toBe(403);

    const changed = await call('PATCH', `/api/v1/projects/WEB/members/${memberId}`, adminCookie, {
      roleId: deleterRoleId,
    });
    expect(changed.statusCode).toBe(204);
    expect((await getProject('WEB', memberCookie)).permissions).toStrictEqual([
      'issue.read',
      'issue.delete',
    ]);

    const removed = await call(
      'DELETE',
      `/api/v1/projects/WEB/members/${outsiderId}`,
      managerCookie,
    );
    expect(removed.statusCode).toBe(204);
    expect((await call('GET', '/api/v1/projects/WEB', outsiderCookie)).statusCode).toBe(404);
  });

  it('answer 404 for someone who is not a member', async () => {
    const response = await call(
      'DELETE',
      `/api/v1/projects/WEB/members/${outsiderId}`,
      adminCookie,
    );

    expect(response.statusCode).toBe(404);
    expect(errorCode(response)).toBe('MEMBER_NOT_FOUND');
  });

  it('take the project out of an invitation, within the manager’s rights', async () => {
    const access = projectAccessResponseSchema.parse(
      (await call('GET', '/api/v1/projects/WEB/access', adminCookie)).json(),
    );
    const invitationOf = (email: string) =>
      access.rows.flatMap((row) =>
        row.kind === 'invitation' && row.email === email ? [row.invitationId] : [],
      )[0] ?? '';
    const nina = invitationOf('nina@example.com');
    const zoe = invitationOf('zoe@example.com');

    // Nina's Team role creates issues, which the manager may not.
    const beyond = await call('DELETE', `/api/v1/projects/WEB/invitations/${nina}`, managerCookie);
    const removed = await call('DELETE', `/api/v1/projects/WEB/invitations/${nina}`, adminCookie);
    const again = await call('DELETE', `/api/v1/projects/WEB/invitations/${nina}`, adminCookie);
    // Zoe's invitation gives every project: it is changed from the members screen.
    const everyProject = await call(
      'DELETE',
      `/api/v1/projects/WEB/invitations/${zoe}`,
      adminCookie,
    );

    expect(beyond.statusCode).toBe(403);
    expect(errorCode(beyond)).toBe('ROLE_BEYOND_YOURS');
    expect(removed.statusCode).toBe(204);
    expect(again.statusCode).toBe(404);
    expect(errorCode(again)).toBe('INVITATION_NOT_FOUND');
    expect(everyProject.statusCode).toBe(404);
  });

  it('keep a role given in a project from being deleted', async () => {
    const response = await call('DELETE', `/api/v1/roles/${deleterRoleId}`, adminCookie);

    expect(response.statusCode).toBe(409);
    expect(errorCode(response)).toBe('ROLE_IN_USE');
  });
});

describe('members who reach every project', () => {
  let linId: string;
  let vicId: string;

  async function rowOf(projectKey: string, userId: string) {
    const [row] = await context.database.db
      .select({ roleId: schema.projectMembers.roleId })
      .from(schema.projectMembers)
      .where(
        and(
          eq(schema.projectMembers.projectId, await projectIdOf(projectKey)),
          eq(schema.projectMembers.userId, userId),
        ),
      );
    return row;
  }

  beforeAll(async () => {
    const person = (name: string, email: string) =>
      createTestUser(context.database, {
        name,
        email,
        password: PASSWORD,
        instanceRoleId: DEFAULT_ROLE_IDS.team,
      });
    linId = await person('Lin Every', 'lin@example.com');
    vicId = await person('Vic Every', 'vic@example.com');
    await createProject('EVR');
    await join('EVR', managerId, managerRoleId);
    // Restricted in the project first, then given every project: the row stays.
    await join('EVR', vicId, managerRoleId);
    await context.database.db
      .update(schema.users)
      .set({ allProjects: true })
      .where(inArray(schema.users.id, [linId, vicId]));
  });

  it('get no role of the project from a manager holding less than their own', async () => {
    const added = await call('POST', '/api/v1/projects/EVR/members', managerCookie, {
      userIds: [linId],
      roleId: managerRoleId,
    });

    expect(added.statusCode).toBe(403);
    expect(errorCode(added)).toBe('ROLE_BEYOND_YOURS');
    expect(await rowOf('EVR', linId)).toBeUndefined();
    await join('EVR', linId, managerRoleId);
    expect(await rowOf('EVR', linId)).toStrictEqual({ roleId: managerRoleId });
  });

  it('keep the role of the project unless the manager holds their own', async () => {
    const removed = await call('DELETE', `/api/v1/projects/EVR/members/${vicId}`, managerCookie);

    expect(removed.statusCode).toBe(403);
    expect(errorCode(removed)).toBe('ROLE_BEYOND_YOURS');
    expect(await rowOf('EVR', vicId)).toStrictEqual({ roleId: managerRoleId });
    const byAdmin = await call('DELETE', `/api/v1/projects/EVR/members/${vicId}`, adminCookie);
    expect(byAdmin.statusCode).toBe(204);
    expect(await rowOf('EVR', vicId)).toBeUndefined();
  });
});
