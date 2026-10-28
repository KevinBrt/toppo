import { isUniqueViolation, schema, uuidv7 } from '@toppo-tracker/db';
import { projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq, isNull } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';

const { workflowStatuses, workflowTransitions, workflows } = schema;

/**
 * Gives a project a workflow of its own: a copy of the instance's, its mode and moves included.
 * The copy shares the instance's statuses, so no issue moves.
 */
export const customizeProjectWorkflow = defineCommand({
  name: 'projectWorkflow.customize',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    // Shared lock: the instance's workflow being saved meanwhile is copied once saved.
    const [instance] = await tx
      .select({ id: workflows.id, mode: workflows.mode })
      .from(workflows)
      .where(isNull(workflows.projectId))
      .for('share');
    if (!instance) {
      throw new Error('The instance has no workflow');
    }

    const id = uuidv7();
    try {
      await tx.insert(workflows).values({ id, projectId: project.id, mode: instance.mode });
    } catch (error) {
      if (isUniqueViolation(error, 'workflows_project_unique')) {
        throw new HttpError(409, 'ALREADY_CUSTOMIZED', 'This project has its own workflow already');
      }
      throw error;
    }
    const steps = await tx
      .select({
        statusId: workflowStatuses.statusId,
        position: workflowStatuses.position,
        isInitial: workflowStatuses.isInitial,
      })
      .from(workflowStatuses)
      .where(eq(workflowStatuses.workflowId, instance.id));
    if (steps.length > 0) {
      await tx.insert(workflowStatuses).values(steps.map((step) => ({ ...step, workflowId: id })));
    }
    const moves = await tx
      .select({
        fromStatusId: workflowTransitions.fromStatusId,
        toStatusId: workflowTransitions.toStatusId,
      })
      .from(workflowTransitions)
      .where(eq(workflowTransitions.workflowId, instance.id));
    if (moves.length > 0) {
      await tx
        .insert(workflowTransitions)
        .values(moves.map((move) => ({ ...move, workflowId: id })));
    }
    log.info({ projectId: project.id, by: actor.id }, 'Project workflow customized');
  },
});
