import {
  can,
  canSeeIssue,
  formatIssueKey,
  isProjectPermission,
  type Permission,
  type ProjectPermission,
  parseIssueKey,
  projectPermissionsOf,
} from '@toppo-tracker/core';
import { type Db, schema } from '@toppo-tracker/db';
import { projectKeySchema } from '@toppo-tracker/shared';
import { and, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { HttpError } from '../http/http-error.ts';
import type { Actor } from './actor.ts';

const { issues, projectMembers, projects, roles, users } = schema;
const ownRoles = alias(roles, 'own_roles');
const projectRoles = alias(roles, 'project_roles');

/** The project an operation is about, and what the actor may do in it. */
export interface ProjectContext {
  id: string;
  key: string;
  /** Read-only while archived. */
  archived: boolean;
  permissions: readonly ProjectPermission[];
}

/** The issue an operation is about, one the actor sees. */
export interface IssueContext {
  id: string;
  /** `WEB-42`. */
  key: string;
  number: number;
  /** Whoever reported an issue may fix its title and description. */
  reportedByActor: boolean;
}

/** The project an issue key names, with that issue. */
export interface IssueProjectContext extends ProjectContext {
  issue: IssueContext;
}

/** The project key in a field of an input: the key itself, or the project part of an issue key. */
export function projectKeyIn(
  field: 'projectKey' | 'issueKey',
  value: string | undefined,
): string | null {
  if (value === undefined) {
    return null;
  }
  return field === 'projectKey' ? value : (parseIssueKey(value)?.projectKey ?? null);
}

const notFound = () => new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');

/**
 * The projects `actorId` reaches, as a condition on `projects`: through the system role, access
 * to every project, or a membership. Lists filter with it in SQL, never after loading.
 */
export function reachableBy(actorId: string): SQL {
  return sql`(
    exists (select 1 from ${users} join ${roles} on ${roles.id} = ${users.instanceRoleId}
      where ${users.id} = ${actorId} and (${roles.grantsAll} or ${users.allProjects}))
    or exists (select 1 from ${projectMembers}
      where ${projectMembers.projectId} = ${projects.id} and ${projectMembers.userId} = ${actorId})
  )`;
}

/**
 * Whether `actorId` reaches every project, present and future: through the system role or their
 * own access to every project. Only they may open every project to someone else.
 */
export async function reachesEveryProject(db: Db, actorId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, eq(roles.id, users.instanceRoleId))
    .where(and(eq(users.id, actorId), or(eq(roles.grantsAll, true), eq(users.allProjects, true))));
  return row !== undefined;
}

/** The project permissions that make someone a manager of a project: its screens are theirs. */
const MANAGING: readonly ProjectPermission[] = [
  'project.settings.manage',
  'project.members.manage',
];

/** The projects whose settings or access `actorId` manages, as a condition on `projects`. */
export function managedBy(actorId: string): SQL {
  return grantedIn(actorId, MANAGING);
}

/**
 * The projects where `actorId` holds at least one of `permissions`, as a condition on `projects`:
 * the system role holds them all; anyone else through the role they have there
 * (`projectPermissionsOf` in `@toppo-tracker/core`, in SQL).
 */
export function grantedIn(actorId: string, permissions: readonly ProjectPermission[]): SQL {
  // In a raw template Drizzle names an alias without its table: the joins spell both out.
  return sql`exists (
    select 1 from ${users}
      join ${roles} as own_roles on ${ownRoles.id} = ${users.instanceRoleId}
      left join ${projectMembers} on ${projectMembers.projectId} = ${projects.id}
        and ${projectMembers.userId} = ${users.id}
      left join ${roles} as project_roles on ${projectRoles.id} = ${projectMembers.roleId}
    where ${users.id} = ${actorId} and (
      ${ownRoles.grantsAll}
      or ((${projectMembers.id} is not null or ${users.allProjects}) and (
        coalesce(${projectRoles.grantsAll}, false)
        or coalesce(${projectRoles.permissions}, ${ownRoles.permissions})
          && ${permissionsArray(permissions)}
      ))
    )
  )`;
}

/** `permissions` as a PostgreSQL array, to compare with the `&&` overlap operator. */
function permissionsArray(permissions: readonly ProjectPermission[]): SQL {
  return sql`array[${sql.join(
    permissions.map((permission) => sql`${permission}`),
    sql`, `,
  )}]::text[]`;
}

/**
 * The project with `key`, as `actor` may use it. A project out of the actor's reach answers like
 * one that does not exist, so that its very existence stays private; one they reach without
 * `permission` is forbidden. A project permission is looked up in the project, an instance one in
 * the actor's own role. One query: the project, the actor's role and their membership.
 */
export async function resolveProject(
  db: Db,
  actor: Actor,
  key: string | null,
  permission?: Permission,
): Promise<ProjectContext> {
  if (key === null) {
    throw notFound();
  }
  const [row] = await db
    .select({
      id: projects.id,
      key: projects.key,
      archivedAt: projects.archivedAt,
      allProjects: users.allProjects,
      ownRole: { grantsAll: ownRoles.grantsAll, permissions: ownRoles.permissions },
      membershipId: projectMembers.id,
      projectRole: { grantsAll: projectRoles.grantsAll, permissions: projectRoles.permissions },
    })
    .from(projects)
    .innerJoin(users, eq(users.id, actor.id))
    .innerJoin(ownRoles, eq(ownRoles.id, users.instanceRoleId))
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, users.id)),
    )
    .leftJoin(projectRoles, eq(projectRoles.id, projectMembers.roleId))
    .where(eq(projects.key, key));
  const permissions = row
    ? projectPermissionsOf({
        role: row.ownRole,
        allProjects: row.allProjects,
        membership: row.membershipId === null ? null : { role: row.projectRole },
      })
    : null;
  if (!(row && permissions)) {
    throw notFound();
  }
  const granted = permission && isProjectPermission(permission) ? permissions : actor.permissions;
  if (permission && !can(granted, permission)) {
    throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to do this');
  }
  return { id: row.id, key: row.key, archived: row.archivedAt !== null, permissions };
}

/**
 * The users who see the issue `issueId`, as a condition on `users`: their account active, they
 * reach its project and read every issue there or, having reported it, their own (`canSeeIssue`
 * in `@toppo-tracker/core`, in SQL). To tell people of a change, or to let a comment name them.
 */
export function seeingIssue(issueId: string): SQL {
  const reads = permissionsArray(['issue.read']);
  const readsOwn = permissionsArray(['issue.read', 'issue.read.own']);
  return sql`(${users.deactivatedAt} is null and ${users.deletedAt} is null and exists (
    select 1 from ${issues}
      join ${roles} as own_roles on ${ownRoles.id} = ${users.instanceRoleId}
      left join ${projectMembers} on ${projectMembers.projectId} = ${issues.projectId}
        and ${projectMembers.userId} = ${users.id}
      left join ${roles} as project_roles on ${projectRoles.id} = ${projectMembers.roleId}
    where ${issues.id} = ${issueId} and (
      ${ownRoles.grantsAll}
      or ((${projectMembers.id} is not null or ${users.allProjects}) and (
        coalesce(${projectRoles.grantsAll}, false)
        or coalesce(${projectRoles.permissions}, ${ownRoles.permissions})
          && case when ${users.id} = ${issues.reporterId} then ${readsOwn} else ${reads} end
      ))
    )
  ))`;
}

/**
 * Those of `issueIds` that `userId` sees, with their key and title: issues where they hold
 * `issue.read`, those they reported where they hold `issue.read.own` (`canSeeIssue`, in SQL).
 */
export async function issuesSeenBy(
  db: Pick<Db, 'select'>,
  userId: string,
  issueIds: readonly string[],
): Promise<{ id: string; key: string; title: string }[]> {
  if (issueIds.length === 0) {
    return [];
  }
  const seen = await db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      projectKey: projects.key,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(
      and(
        inArray(issues.id, [...new Set(issueIds)]),
        or(
          grantedIn(userId, ['issue.read']),
          and(eq(issues.reporterId, userId), grantedIn(userId, ['issue.read.own'])),
        ),
      ),
    );
  return seen.map(({ id, number, title, projectKey }) => ({
    id,
    key: formatIssueKey({ projectKey: projectKeySchema.parse(projectKey), number }),
    title,
  }));
}

/** Those of `userIds` who see the issue `issueId` (`seeingIssue`). */
export async function whoSeesIssue(
  db: Pick<Db, 'select'>,
  issueId: string,
  userIds: readonly string[],
): Promise<string[]> {
  if (userIds.length === 0) {
    return [];
  }
  const people = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, [...userIds]), seeingIssue(issueId)));
  return people.map(({ id }) => id);
}

/**
 * The issue with `issueKey` and its project, as `actor` may use them: the project first, as
 * `resolveProject` does, then the issue. An issue the actor does not see (someone else's, when
 * they see only their own) answers like one that does not exist.
 */
export async function resolveIssue(
  db: Db,
  actor: Actor,
  issueKey: string | undefined,
  permission?: Permission,
): Promise<IssueProjectContext> {
  const parts = issueKey === undefined ? null : parseIssueKey(issueKey);
  const project = await resolveProject(db, actor, parts?.projectKey ?? null, permission);
  const [issue] = parts
    ? await db
        .select({ id: issues.id, reporterId: issues.reporterId })
        .from(issues)
        .where(and(eq(issues.projectId, project.id), eq(issues.number, parts.number)))
    : [];
  const reportedByActor = issue?.reporterId === actor.id;
  if (!(parts && issue && canSeeIssue(project.permissions, reportedByActor))) {
    throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
  }
  return {
    ...project,
    issue: { id: issue.id, key: formatIssueKey(parts), number: parts.number, reportedByActor },
  };
}
