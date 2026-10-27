import { containsText, type Db, schema } from '@toppo/db';
import {
  PRIORITY_LEVELS,
  PROJECT_MEMBERS_PREVIEW,
  PROJECTS_PAGE_SIZE,
  type ProjectSummary,
  type ProjectsResponse,
  projectsQuerySchema,
} from '@toppo/shared';
import { and, count, eq, inArray, isNotNull, isNull, lte, max, sql } from 'drizzle-orm';
import { managedBy, reachableBy } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { activities, issues, priorities, projectMembers, projects, users } = schema;

/** The highest priority level: urgent. */
const URGENT = Math.max(...PRIORITY_LEVELS);

/**
 * One page of the projects the caller reaches, or only those they manage, with the counts of the
 * active and archived tabs and, for those they manage, a glimpse of each project's members.
 */
export const listProjects = defineQuery({
  name: 'project.list',
  access: 'authenticated',
  input: projectsQuerySchema,
  async handler({ db, actor }, { scope, state, search, page }): Promise<ProjectsResponse> {
    const visible = and(
      scope === 'managed' ? managedBy(actor.id) : reachableBy(actor.id),
      search ? containsText([projects.key, projects.name], search) : undefined,
    );
    const inState =
      state === 'archived' ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt);

    const rows = await db
      .select({
        id: projects.id,
        key: projects.key,
        name: projects.name,
        description: projects.description,
        color: projects.color,
      })
      .from(projects)
      .where(and(visible, inState))
      .orderBy(sql`lower(${projects.name})`, projects.key)
      .limit(PROJECTS_PAGE_SIZE)
      .offset((page - 1) * PROJECTS_PAGE_SIZE);
    const [counts] = await db
      .select({
        active: count(sql`case when ${projects.archivedAt} is null then 1 end`),
        archived: count(projects.archivedAt),
      })
      .from(projects)
      .where(visible);
    const ids = rows.map(({ id }) => id);
    // Members and counts of issues are for those who manage the projects: not for every member who
    // reaches one, who may see their own issues only.
    const [members, stats] =
      scope === 'managed'
        ? await Promise.all([membersOf(db, ids), issueStatsOf(db, ids)])
        : [null, null];

    const active = counts?.active ?? 0;
    const archived = counts?.archived ?? 0;
    return {
      rows: rows.map((row) => ({
        ...row,
        members: members ? (members.get(row.id) ?? NO_MEMBERS) : null,
        issues: stats ? (stats.get(row.id) ?? NO_ISSUES) : null,
      })),
      matching: state === 'archived' ? archived : active,
      counts: { active, archived },
      page,
      pageSize: PROJECTS_PAGE_SIZE,
    };
  },
});

type MembersPreview = NonNullable<ProjectSummary['members']>;
type IssueStats = NonNullable<ProjectSummary['issues']>;

const NO_ISSUES: IssueStats = { open: 0, urgent: 0, lastActivityAt: null };

/** Each project's open and urgent issues and its last activity: two grouped queries for the page. */
async function issueStatsOf(db: Db, projectIds: string[]): Promise<Map<string, IssueStats>> {
  if (projectIds.length === 0) {
    return new Map();
  }
  const [counts, latest] = await Promise.all([
    db
      .select({
        projectId: issues.projectId,
        open: count(sql`case when ${issues.closedAt} is null then 1 end`),
        urgent: count(
          sql`case when ${issues.closedAt} is null and ${priorities.level} = ${URGENT} then 1 end`,
        ),
      })
      .from(issues)
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .where(inArray(issues.projectId, projectIds))
      .groupBy(issues.projectId),
    db
      .select({ projectId: activities.projectId, at: max(activities.createdAt) })
      .from(activities)
      .where(inArray(activities.projectId, projectIds))
      .groupBy(activities.projectId),
  ]);
  const stats = new Map<string, IssueStats>();
  for (const projectId of projectIds) {
    const counted = counts.find((row) => row.projectId === projectId);
    const last = latest.find((row) => row.projectId === projectId)?.at ?? null;
    stats.set(projectId, {
      open: counted?.open ?? 0,
      urgent: counted?.urgent ?? 0,
      lastActivityAt: last?.toISOString() ?? null,
    });
  }
  return stats;
}

const NO_MEMBERS: MembersPreview = { count: 0, shown: [] };

/** How many people each project lists, and the first of them by name: one query for the page. */
async function membersOf(db: Db, projectIds: string[]): Promise<Map<string, MembersPreview>> {
  if (projectIds.length === 0) {
    return new Map();
  }
  const ranked = db
    .select({
      projectId: projectMembers.projectId,
      userId: users.id,
      name: users.name,
      rank: sql<number>`row_number() over (partition by ${projectMembers.projectId}
        order by lower(${users.name}), ${users.id})`.as('rank'),
      total: sql<number>`count(*) over (partition by ${projectMembers.projectId})`
        .mapWith(Number)
        .as('total'),
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(and(inArray(projectMembers.projectId, projectIds), isNull(users.deletedAt)))
    .as('ranked');
  const shown = await db
    .select({
      projectId: ranked.projectId,
      userId: ranked.userId,
      name: ranked.name,
      total: ranked.total,
    })
    .from(ranked)
    .where(lte(ranked.rank, PROJECT_MEMBERS_PREVIEW))
    .orderBy(ranked.projectId, ranked.rank);

  const previews = new Map<string, MembersPreview>();
  for (const { projectId, userId, name, total } of shown) {
    const preview = previews.get(projectId) ?? { count: Number(total), shown: [] };
    preview.shown.push({ userId, name });
    previews.set(projectId, preview);
  }
  return previews;
}
