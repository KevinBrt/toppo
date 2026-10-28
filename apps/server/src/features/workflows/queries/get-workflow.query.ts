import { type Db, schema } from '@toppo-tracker/db';
import type { WorkflowResponse, WorkflowStatusRow } from '@toppo-tracker/shared';
import { and, asc, count, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';

const { issues, statuses, workflowStatuses, workflowTransitions, workflows } = schema;

/** The issues the instance's workflow governs: those of projects without a copy of their own. */
export const FOLLOWING_THE_INSTANCE: SQL = sql`not exists (
  select 1 from ${workflows} where ${workflows.projectId} = ${issues.projectId}
)`;

/** A workflow's status, and whether it is one of the instance's. */
type ReadStatus = WorkflowStatusRow & { shared: boolean };

/**
 * The instance's workflow, which every project follows until it makes a copy of its own: its
 * statuses in order, how many issues that follow it are on each, and the moves between them.
 */
export const getWorkflow = defineQuery({
  name: 'workflow.get',
  access: { permission: 'instance.settings.manage' },
  input: z.object({}),
  async handler({ db }): Promise<WorkflowResponse> {
    const workflow = await instanceWorkflow(db);
    const { statuses: steps, transitions } = await readWorkflow(
      db,
      workflow.id,
      FOLLOWING_THE_INSTANCE,
    );
    return {
      mode: workflow.mode,
      statuses: steps.map(({ shared: _shared, ...status }) => status),
      transitions,
    };
  },
});

/** The instance's workflow, which a fresh instance gets at setup. */
export async function instanceWorkflow(db: Db) {
  const [workflow] = await db
    .select({ id: workflows.id, mode: workflows.mode })
    .from(workflows)
    .where(isNull(workflows.projectId));
  if (!workflow) {
    throw new Error('The instance has no workflow');
  }
  return workflow;
}

/** A workflow's statuses in order, with the issues `followers` selects on each, and its moves. */
export async function readWorkflow(
  db: Db,
  workflowId: string,
  followers: SQL,
): Promise<{ statuses: ReadStatus[]; transitions: WorkflowResponse['transitions'] }> {
  const [steps, moves] = await Promise.all([
    db
      .select({
        id: statuses.id,
        name: statuses.name,
        color: statuses.color,
        closes: statuses.closes,
        projectId: statuses.projectId,
        isInitial: workflowStatuses.isInitial,
      })
      .from(workflowStatuses)
      .innerJoin(statuses, eq(statuses.id, workflowStatuses.statusId))
      .where(eq(workflowStatuses.workflowId, workflowId))
      .orderBy(asc(workflowStatuses.position), asc(workflowStatuses.id)),
    db
      .select({ from: workflowTransitions.fromStatusId, to: workflowTransitions.toStatusId })
      .from(workflowTransitions)
      .where(eq(workflowTransitions.workflowId, workflowId))
      .orderBy(asc(workflowTransitions.id)),
  ]);
  const counts =
    steps.length === 0
      ? []
      : await db
          .select({ statusId: issues.statusId, count: count() })
          .from(issues)
          .where(
            and(
              inArray(
                issues.statusId,
                steps.map(({ id }) => id),
              ),
              followers,
            ),
          )
          .groupBy(issues.statusId);

  return {
    statuses: steps.map(({ projectId, ...step }) => ({
      ...step,
      shared: projectId === null,
      issueCount: counts.find(({ statusId }) => statusId === step.id)?.count ?? 0,
    })),
    transitions: moves,
  };
}
