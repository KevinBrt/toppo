import { schema } from '@toppo-tracker/db';
import { projectKeyParamsSchema, revertWorkflowRequestSchema } from '@toppo-tracker/shared';
import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { moveIssuesTo } from './save-workflow.command.ts';

const { issues, statuses, workflowStatuses, workflows } = schema;

/**
 * Makes a project follow the instance's workflow again: its issues on a status the instance's
 * lacks move to the one chosen, one activity each, then its copy goes, with the statuses it was
 * the only one to use.
 */
export const revertProjectWorkflow = defineCommand({
  name: 'projectWorkflow.revert',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema.extend(revertWorkflowRequestSchema.shape),
  async handler({ tx, actor, project, log }, { moves }): Promise<void> {
    const [copy] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.projectId, project.id))
      .for('update');
    if (!copy) {
      throw new HttpError(409, 'NOT_CUSTOMIZED', 'This project follows the instance’s workflow');
    }
    // Shared lock: the instance's workflow being saved meanwhile is followed once saved.
    const [instance] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(isNull(workflows.projectId))
      .for('share');
    if (!instance) {
      throw new Error('The instance has no workflow');
    }
    const organization = await stepsOf(tx, instance.id);
    const own = await stepsOf(tx, copy.id);
    const ofProject = eq(issues.projectId, project.id);

    let moved = 0;
    for (const status of own.filter(({ id }) => !organization.some((step) => step.id === id))) {
      const [used] = await tx
        .select({ count: count() })
        .from(issues)
        .where(and(ofProject, eq(issues.statusId, status.id)));
      if ((used?.count ?? 0) === 0) {
        continue;
      }
      const target = organization.find(
        ({ id }) => id === moves.find(({ statusId }) => statusId === status.id)?.moveTo,
      );
      if (!target) {
        throw new HttpError(
          409,
          'MOVE_REQUIRED',
          'Issues are on a status the instance’s workflow lacks: say where they go',
        );
      }
      moved += await moveIssuesTo(tx, actor.id, ofProject, status, target);
    }

    await tx.delete(workflows).where(eq(workflows.id, copy.id));
    // The copy's statuses no workflow uses any more and no issue has: its own, and one of the
    // instance's taken out of the instance's workflow since.
    await tx.delete(statuses).where(
      and(
        inArray(
          statuses.id,
          own.map(({ id }) => id),
        ),
        sql`not exists (select 1 from ${workflowStatuses} where ${workflowStatuses.statusId} = ${statuses.id})`,
        sql`not exists (select 1 from ${issues} where ${issues.statusId} = ${statuses.id})`,
      ),
    );
    log.info({ projectId: project.id, by: actor.id, moved }, 'Project workflow reverted');
  },
});

/** A workflow's statuses, as moving issues needs them. */
async function stepsOf(tx: Transaction, workflowId: string) {
  return await tx
    .select({ id: statuses.id, name: statuses.name, closes: statuses.closes })
    .from(workflowStatuses)
    .innerJoin(statuses, eq(statuses.id, workflowStatuses.statusId))
    .where(eq(workflowStatuses.workflowId, workflowId));
}
