import { issueActionsOf } from '@toppo/core';
import { schema } from '@toppo/db';
import { type IssueResponse, issueKeyParamsSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { labelsOfIssue, propertyValuesOfIssue, toIssueSummary } from '../utils/issue-rows.util.ts';

const { issueCategories, issues, priorities, projects, statuses, users } = schema;
const assignees = alias(users, 'assignees');
const reporters = alias(users, 'reporters');

/** An issue the caller sees, by its key, with what they may do on it. */
export const getIssue = defineQuery({
  name: 'issue.get',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema,
  async handler({ db, project }): Promise<IssueResponse> {
    const [row] = await db
      .select({
        number: issues.number,
        title: issues.title,
        description: issues.description,
        projectName: projects.name,
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
        properties: propertyValuesOfIssue({ listedOnly: false }),
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        closedAt: issues.closedAt,
      })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(statuses, eq(statuses.id, issues.statusId))
      .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .innerJoin(reporters, eq(reporters.id, issues.reporterId))
      .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
      .where(eq(issues.id, project.issue.id));
    if (!row) {
      throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
    }
    return {
      ...toIssueSummary(project.key, row),
      id: project.issue.id,
      project: { key: project.key, name: row.projectName },
      description: row.description,
      closedAt: row.closedAt?.toISOString() ?? null,
      // Read-only while archived: nothing to offer.
      actions: project.archived
        ? []
        : issueActionsOf(project.permissions, project.issue.reportedByActor),
    };
  },
});
