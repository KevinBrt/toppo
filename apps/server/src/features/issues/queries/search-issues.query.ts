import { issueReferenceIn } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  ISSUE_SEARCH_LIMIT,
  type IssueSearchResponse,
  issueSearchQuerySchema,
} from '@toppo/shared';
import { and, desc, eq, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { grantedIn } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { labelsOfIssue, propertyValuesOfIssue, toIssueSummary } from '../utils/issue-rows.util.ts';
import { textMatching, textRank } from '../utils/issue-search.util.ts';

const { issueCategories, issues, priorities, projects, statuses, users } = schema;
const assignees = alias(users, 'assignees');
const reporters = alias(users, 'reporters');

/**
 * The issues a search finds in every project the caller reaches, those they may read only, out
 * of archived projects: the issue named by its key (`WEB-42`) first, then those whose words match
 * best, then the latest changed. A few, never a page: the command palette shows them.
 */
export const searchIssues = defineQuery({
  name: 'issue.search',
  access: 'authenticated',
  input: issueSearchQuerySchema,
  async handler({ db, actor }, { search }): Promise<IssueSearchResponse> {
    const named = namedIn(search);
    // The best few first, found and ranked from the issues and their projects alone; then their
    // fields, for those few only. PostgreSQL cannot tell how many issues words typed in part
    // match, and joining the fields before ranking them would do it for thousands.
    const best = db
      .select({
        id: issues.id,
        named: (named ?? sql<boolean>`false`).as('named'),
        rank: textRank(search).as('rank'),
      })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(
        and(
          isNull(projects.archivedAt),
          or(
            grantedIn(actor.id, ['issue.read']),
            and(eq(issues.reporterId, actor.id), grantedIn(actor.id, ['issue.read.own'])),
          ),
          or(textMatching(search), named),
        ),
      )
      .orderBy(
        ...(named ? [sql`${named} desc`] : []),
        desc(textRank(search)),
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
      .orderBy(desc(best.named), desc(best.rank), desc(issues.updatedAt), desc(issues.id));

    return {
      rows: rows.map(({ project, ...row }) => ({ ...toIssueSummary(project.key, row), project })),
    };
  },
});

/** The issue a search names by its full key, if it does; a number alone names one per project. */
function namedIn(search: string): SQL | undefined {
  const reference = issueReferenceIn(search);
  return reference?.projectKey
    ? and(eq(projects.key, reference.projectKey), eq(issues.number, reference.number))
    : undefined;
}
