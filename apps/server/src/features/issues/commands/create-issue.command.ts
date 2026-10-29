import {
  can,
  creationValuesOf,
  effectiveWorkflow,
  formatIssueKey,
  initialStatusOf,
  peopleNamedIn,
} from '@toppo-tracker/core';
import { schema, uuidv7 } from '@toppo-tracker/db';
import {
  createIssueRequestSchema,
  projectIssuesParamsSchema,
  projectKeySchema,
} from '@toppo-tracker/shared';
import { eq, isNull, or, sql } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';
import {
  assertNameable,
  fieldSettingsOf,
  lockedPropertyRules,
  propertyRefusal,
  writtenByPlugin,
} from '../utils/issue-properties.util.ts';
import { rememberWords } from '../utils/issue-search.util.ts';
import { assertAssignable } from './assign-issue.command.ts';

const { issueCategories, issues, priorities, projects, workflowStatuses, workflows } = schema;

/**
 * Creates an issue in a project: numbered by the project's counter, in its workflow's initial
 * status, with the default category and priority unless others are given (the project may ask
 * for them), and the values of its properties given, those required included
 * (`creationValuesOf`), the people they name reaching the project. Assigning it at once, or
 * naming someone in a person property, needs `issue.assign`.
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
    const settings = await fieldSettingsOf(tx, project.id);
    if (settings.category.required && input.categoryId === undefined) {
      throw new HttpError(400, 'CATEGORY_REQUIRED', 'This project asks for a category');
    }
    if (settings.priority.required && input.priorityId === undefined) {
      throw new HttpError(400, 'PRIORITY_REQUIRED', 'This project asks for a priority');
    }
    // Naming someone in a person property is choosing among those who may be assigned: it needs
    // `issue.assign`, and such a property is never required of those who cannot.
    const mayName = can(project.permissions, 'issue.assign');
    const all = await lockedPropertyRules(tx, project.id);
    if (!mayName && all.some(({ id, type }) => type === 'user' && id in input.properties)) {
      throw new HttpError(403, 'FORBIDDEN', 'You do not have permission to name people here');
    }
    if (all.some(({ id, writtenBy }) => writtenBy === 'plugin' && id in input.properties)) {
      throw writtenByPlugin();
    }
    const rules = all.filter(({ type }) => mayName || type !== 'user');
    const given = creationValuesOf(rules, input.properties);
    if ('problem' in given) {
      throw propertyRefusal(given);
    }
    await assertNameable(tx, project.id, peopleNamedIn(rules, given.values));
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
      properties: given.values,
    });
    await rememberWords(tx, id);
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
