import {
  can,
  creationValuesProblem,
  effectiveWorkflow,
  formatIssueKey,
  initialStatusOf,
  type PropertyProblem,
} from '@toppo/core';
import { schema, uuidv7 } from '@toppo/db';
import {
  createIssueRequestSchema,
  projectIssuesParamsSchema,
  projectKeySchema,
} from '@toppo/shared';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';
import { lockedPropertyRules } from '../utils/issue-properties.util.ts';
import { assertAssignable } from './assign-issue.command.ts';

const { issueCategories, issues, priorities, projects, workflowStatuses, workflows } = schema;

/** What the reporter is told when the values of the properties cannot be taken. */
const PROPERTY_REFUSALS: Readonly<
  Record<PropertyProblem['problem'], [code: string, message: string]>
> = {
  unknownProperty: ['PROPERTY_NOT_FOUND', 'This property does not exist'],
  unknownOption: ['INVALID_PROPERTY_OPTION', 'This option is not one of the property'],
  missingRequired: ['PROPERTY_REQUIRED', 'This property is required'],
};

/**
 * Creates an issue in a project: numbered by the project's counter, in its workflow's initial
 * status, with the default category and priority unless others are given, and the values of the
 * properties given, those required included (`creationValuesProblem`). Assigning it at once
 * needs `issue.assign`.
 */
export const createIssue = defineCommand({
  name: 'issue.create',
  access: { project: 'projectKey', permission: 'issue.create' },
  input: projectIssuesParamsSchema.extend(createIssueRequestSchema.shape),
  async handler({ tx, actor, project, log }, input): Promise<{ id: string; key: string }> {
    if (input.assigneeId && !can(project.permissions, 'issue.assign')) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to assign issues');
    }
    if (input.assigneeId) {
      await assertAssignable(tx, project.id, input.assigneeId);
    }
    const problem = creationValuesProblem(await lockedPropertyRules(tx), input.properties);
    if (problem) {
      const [code, message] = PROPERTY_REFUSALS[problem.problem];
      throw new HttpError(400, code, message);
    }
    const categoryId = await categoryOf(tx, input.categoryId);
    const priorityId = await priorityOf(tx, input.priorityId);
    const statusId = await initialStatusIn(tx, project.id);
    // One statement takes the number and locks the project's row until the end: two issues never
    // share a number, and a number is never given twice.
    const [counter] = await tx
      .update(projects)
      .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
      .where(eq(projects.id, project.id))
      .returning({ number: sql<number>`${projects.nextIssueNumber} - 1` });
    if (!counter) {
      throw new HttpError(404, 'PROJECT_NOT_FOUND', 'This project does not exist');
    }

    const id = uuidv7();
    await tx.insert(issues).values({
      id,
      projectId: project.id,
      number: counter.number,
      title: input.title,
      description: input.description,
      categoryId,
      priorityId,
      statusId,
      assigneeId: input.assigneeId ?? null,
      reporterId: actor.id,
      properties: input.properties,
    });
    await recordActivity(tx, {
      projectId: project.id,
      issueId: id,
      actorId: actor.id,
      ...activity('issue.created', { assigneeId: input.assigneeId ?? null }),
    });
    const key = formatIssueKey({
      projectKey: projectKeySchema.parse(project.key),
      number: counter.number,
    });
    log.info({ issueId: id, key, by: actor.id }, 'Issue created');
    return { id, key };
  },
});

/** The category asked for, which must exist, or the default one. */
async function categoryOf(tx: Transaction, requested: string | undefined): Promise<string> {
  const [category] = await tx
    .select({ id: issueCategories.id })
    .from(issueCategories)
    .where(requested ? eq(issueCategories.id, requested) : eq(issueCategories.isDefault, true));
  if (!category) {
    throw new HttpError(400, 'INVALID_CATEGORY', 'This category does not exist');
  }
  return category.id;
}

/** The priority asked for, which must exist, or the default one. */
async function priorityOf(tx: Transaction, requested: string | undefined): Promise<string> {
  const [priority] = await tx
    .select({ id: priorities.id })
    .from(priorities)
    .where(requested ? eq(priorities.id, requested) : eq(priorities.isDefault, true));
  if (!priority) {
    throw new HttpError(400, 'INVALID_PRIORITY', 'This priority does not exist');
  }
  return priority.id;
}

/** Where new issues start in the project's workflow: its own copy, else the instance's. */
async function initialStatusIn(tx: Transaction, projectId: string): Promise<string> {
  // Shared lock: a workflow being saved meanwhile is read once saved, never half-way.
  const candidates = await tx
    .select({ id: workflows.id, projectId: workflows.projectId })
    .from(workflows)
    .where(or(isNull(workflows.projectId), eq(workflows.projectId, projectId)))
    .for('share');
  const workflow = effectiveWorkflow(candidates, projectId);
  const steps = await tx
    .select({ statusId: workflowStatuses.statusId, isInitial: workflowStatuses.isInitial })
    .from(workflowStatuses)
    .where(eq(workflowStatuses.workflowId, workflow.id));
  return initialStatusOf(steps);
}
