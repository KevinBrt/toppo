import { issueReferencesIn } from '@toppo-tracker/core';
import { schema, similarWords } from '@toppo-tracker/db';
import {
  ISSUE_SEARCH_LIMIT,
  type IssueSearchResponse,
  issueSearchQuerySchema,
} from '@toppo-tracker/shared';
import { and, desc, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { grantedIn } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { labelsOfIssue, propertyValuesOfIssue, toIssueSummary } from '../utils/issue-rows.util.ts';
import { textMatching, textRank, typedMatching } from '../utils/issue-search.util.ts';

const { issueCategories, issues, priorities, projects, statuses, users } = schema;
const assignees = alias(users, 'assignees');
const reporters = alias(users, 'reporters');

/**
 * The issues a search finds in every project the caller reaches, those they may read only, out
 * of archived projects: the issues its reference names (`WEB-42`, `web42`, `42` in any project)
 * first, then those having the words as typed, then those a corrected typo finds, each by how
 * well their words match, then the latest changed. A few, never a page: the palette shows them.
 */
export const searchIssues = defineQuery({
  name: 'issue.search',
  access: 'authenticated',
  input: issueSearchQuerySchema,
  async handler({ db, actor }, { search }): Promise<IssueSearchResponse> {
    // The projects read, found once rather than checked for each issue a common word finds.
    const reached = (permission: 'issue.read' | 'issue.read.own') =>
      db
        .select({ id: projects.id, key: projects.key })
        .from(projects)
        .where(and(isNull(projects.archivedAt), grantedIn(actor.id, [permission])));
    const [every, own] = await Promise.all([reached('issue.read'), reached('issue.read.own')]);
    const ownOnly = own.filter(({ id }) => !every.some((project) => project.id === id));
    if (every.length === 0 && ownOnly.length === 0) {
      return { rows: [] };
    }
    const readable = or(
      every.length > 0
        ? inArray(
            issues.projectId,
            every.map(({ id }) => id),
          )
        : undefined,
      ownOnly.length > 0
        ? and(
            inArray(
              issues.projectId,
              ownOnly.map(({ id }) => id),
            ),
            eq(issues.reporterId, actor.id),
          )
        : undefined,
    );
    const named = namedIn(search, [...every, ...ownOnly]);
    // Typos are corrected from the projects whose every issue is read only: the words of others
    // would tell what issues out of reach say.
    const similar = await similarWords(
      db,
      search,
      every.map(({ id }) => id),
    );
    // The best few first, found and ranked from the issues alone; then their fields, for those
    // few only. PostgreSQL cannot tell how many issues words typed in part match, and joining the
    // fields before ranking them would do it for thousands.
    const best = db
      .select({
        id: issues.id,
        named: (named ?? sql<boolean>`false`).as('named'),
        typed: typedMatching(search).as('typed'),
        rank: textRank(search, similar).as('rank'),
      })
      .from(issues)
      .where(and(readable, or(textMatching(search, similar), named)))
      .orderBy(
        ...(named ? [sql`${named} desc`] : []),
        desc(typedMatching(search)),
        desc(textRank(search, similar)),
        desc(issues.updatedAt),
        desc(issues.id),
      )
      .limit(ISSUE_SEARCH_LIMIT)
      .as('best');
    const rows = await db
      .select({
        project: { key: projects.key, name: projects.name, color: projects.color },
        number: issues.number,
        title: issues.title,
        status: {
          id: statuses.id,
          name: statuses.name,
          color: statuses.color,
          closes: statuses.closes,
        },
        category: {
          id: issueCategories.id,
          name: issueCategories.name,
          color: issueCategories.color,
        },
        priority: { id: priorities.id, name: priorities.name, level: priorities.level },
        assignee: { id: assignees.id, name: assignees.name, deletedAt: assignees.deletedAt },
        reporter: { id: reporters.id, name: reporters.name, deletedAt: reporters.deletedAt },
        labels: labelsOfIssue,
        properties: propertyValuesOfIssue({ listedOnly: true }),
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
      })
      .from(best)
      .innerJoin(issues, eq(issues.id, best.id))
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(statuses, eq(statuses.id, issues.statusId))
      .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .innerJoin(reporters, eq(reporters.id, issues.reporterId))
      .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
      .orderBy(
        desc(best.named),
        desc(best.typed),
        desc(best.rank),
        desc(issues.updatedAt),
        desc(issues.id),
      );

    return {
      rows: rows.map(({ project, ...row }) => ({ ...toIssueSummary(project.key, row), project })),
    };
  },
});

/**
 * The issues a search names among the projects read: by their key however written, or by their
 * number alone, in each of those projects.
 */
function namedIn(search: string, read: readonly { id: string; key: string }[]): SQL | undefined {
  return or(
    ...issueReferencesIn(search).map(({ projectKey, number }) => {
      if (projectKey === null) {
        return eq(issues.number, number);
      }
      const project = read.find(({ key }) => key === projectKey);
      return project ? and(eq(issues.projectId, project.id), eq(issues.number, number)) : undefined;
    }),
  );
}
