import { containsText, type Db, schema } from '@toppo-tracker/db';
import {
  PROJECT_ACCESS_PAGE_SIZE,
  type ProjectAccessReason,
  type ProjectAccessResponse,
  type ProjectAccessRow,
  projectAccessQuerySchema,
  projectKeyParamsSchema,
} from '@toppo-tracker/shared';
import { and, count, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineQuery } from '../../../../platform/cqrs/cqrs.ts';

const { invitationProjects, invitations, projectMembers, roles, users } = schema;
const projectRoles = alias(roles, 'project_roles');

interface Page {
  offset: number;
  limit: number;
}

/**
 * One page of everyone who has access to the project: those who reach it whatever its members
 * (the system role, every project) first, then its members, then the pending invitations that
 * will bring someone in. People come before invitations, so a page may hold some of each.
 */
export const listProjectAccess = defineQuery({
  name: 'project.listAccess',
  access: { project: 'projectKey', permission: 'project.members.manage' },
  input: projectKeyParamsSchema.extend(projectAccessQuerySchema.shape),
  async handler({ db, project }, { search, page }): Promise<ProjectAccessResponse> {
    const offset = (page - 1) * PROJECT_ACCESS_PAGE_SIZE;
    const people = peopleWithAccess(project.id, search);
    const invited = invitationsGivingAccess(project.id, search);
    const [peopleCount, invitationCount] = await Promise.all([people.count(db), invited.count(db)]);

    const peopleRows = await people.rows(db, { offset, limit: PROJECT_ACCESS_PAGE_SIZE });
    const room = PROJECT_ACCESS_PAGE_SIZE - peopleRows.length;
    const invitationRows =
      room > 0
        ? await invited.rows(db, { offset: Math.max(0, offset - peopleCount), limit: room })
        : [];

    return {
      rows: [...peopleRows, ...invitationRows],
      matching: peopleCount + invitationCount,
      page,
      pageSize: PROJECT_ACCESS_PAGE_SIZE,
    };
  },
});

/** People who reach the project, by how they reach it, then by name. */
function peopleWithAccess(projectId: string, search: string | undefined) {
  const reaching = and(
    isNull(users.deletedAt),
    or(eq(roles.grantsAll, true), eq(users.allProjects, true), isNotNull(projectMembers.id)),
    search ? containsText([users.name, users.email], search) : undefined,
  );
  const membership = and(
    eq(projectMembers.projectId, projectId),
    eq(projectMembers.userId, users.id),
  );
  const reason = sql<ProjectAccessReason>`case
    when ${roles.grantsAll} then 'systemRole'
    when ${users.allProjects} then 'allProjects'
    else 'member' end`;
  const rank: SQL = sql`case when ${roles.grantsAll} then 0 when ${users.allProjects} then 1 else 2 end`;

  return {
    async count(db: Db): Promise<number> {
      const [total] = await db
        .select({ count: count() })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.instanceRoleId))
        .leftJoin(projectMembers, membership)
        .where(reaching);
      return total?.count ?? 0;
    },
    async rows(db: Db, { offset, limit }: Page): Promise<ProjectAccessRow[]> {
      const rows = await db
        .select({
          userId: users.id,
          name: users.name,
          email: users.email,
          access: reason,
          ownRole: { id: roles.id, name: roles.name, color: roles.color },
          projectRole: { id: projectRoles.id, name: projectRoles.name, color: projectRoles.color },
          deactivatedAt: users.deactivatedAt,
        })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.instanceRoleId))
        .leftJoin(projectMembers, membership)
        .leftJoin(projectRoles, eq(projectRoles.id, projectMembers.roleId))
        .where(reaching)
        .orderBy(rank, sql`lower(${users.name})`, users.id)
        .limit(limit)
        .offset(offset);
      return rows.map(({ deactivatedAt, ...person }) => ({
        kind: 'person',
        ...person,
        deactivatedAt: deactivatedAt?.toISOString() ?? null,
      }));
    },
  };
}

/** Pending invitations that give the project, alone or with every other, by address. */
function invitationsGivingAccess(projectId: string, search: string | undefined) {
  const giving = and(
    isNull(invitations.acceptedAt),
    or(
      eq(invitations.allProjects, true),
      sql`exists (select 1 from ${invitationProjects}
        where ${invitationProjects.invitationId} = ${invitations.id}
          and ${invitationProjects.projectId} = ${projectId})`,
    ),
    search ? containsText([invitations.email], search) : undefined,
  );

  return {
    async count(db: Db): Promise<number> {
      const [total] = await db.select({ count: count() }).from(invitations).where(giving);
      return total?.count ?? 0;
    },
    async rows(db: Db, { offset, limit }: Page): Promise<ProjectAccessRow[]> {
      const rows = await db
        .select({
          invitationId: invitations.id,
          email: invitations.email,
          role: { id: roles.id, name: roles.name, color: roles.color },
          allProjects: invitations.allProjects,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .innerJoin(roles, eq(roles.id, invitations.roleId))
        .where(giving)
        .orderBy(invitations.email, invitations.id)
        .limit(limit)
        .offset(offset);
      return rows.map(({ expiresAt, ...invitation }) => ({
        kind: 'invitation',
        ...invitation,
        expiresAt: expiresAt.toISOString(),
      }));
    },
  };
}
