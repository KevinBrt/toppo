import { schema } from '@toppo-tracker/db';
import {
  type AssignedIssuesResponse,
  ISSUES_PAGE_SIZE,
  issuesQuerySchema,
} from '@toppo-tracker/shared';
import { and, count, desc, eq, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { grantedIn } from '../../../platform/auth/project-access.ts';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { labelsOfIssue, propertyValuesOfIssue, toIssueSummary } from '../utils/issue-rows.util.ts';

const { issueCategories, issues, priorities, projects, statuses, users } = schema;
const assignees = alias(users, 'assignees');
const reporters = alias(users, 'reporters');

/**
 * One page of the issues assigned to the caller, open or closed, in every project they reach, the
 * most urgent first. Only those they may still read there, filtered in the query: assigned to them
 * once is not enough. Archived projects are left out, nothing is left to do in them.
 */
export const listAssignedIssues = defineQuery({
  name: 'issue.listAssigned',
  access: 'authenticated',
  input: issuesQuerySchema,
  async handler({ db, actor }, { page }): Promise<AssignedIssuesResponse> {
    const visible = and(
      eq(issues.assigneeId, actor.id),
      isNull(projects.archivedAt),
      or(
        grantedIn(actor.id, ['issue.read']),
        and(eq(issues.reporterId, actor.id), grantedIn(actor.id, ['issue.read.own'])),
      ),
    );
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
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(statuses, eq(statuses.id, issues.statusId))
      .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .innerJoin(reporters, eq(reporters.id, issues.reporterId))
      .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
      .where(visible)
      .orderBy(desc(priorities.level), desc(issues.createdAt), desc(issues.id))
      .limit(ISSUES_PAGE_SIZE)
      .offset((page - 1) * ISSUES_PAGE_SIZE);
    const [total] = await db
      .select({ count: count() })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(visible);

    return {
      rows: rows.map(({ project, ...row }) => ({ ...toIssueSummary(project.key, row), project })),
      matching: total?.count ?? 0,
      page,
      pageSize: ISSUES_PAGE_SIZE,
    };
  },
});
