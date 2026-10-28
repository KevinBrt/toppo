import { schema } from '@toppo-tracker/db';
import {
  checkWorkflow,
  projectKeyParamsSchema,
  workflowRequestSchema,
} from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { applyWorkflow } from './save-workflow.command.ts';

const { issues, workflows } = schema;

/**
 * Saves a project's own workflow whole, as the instance's is saved, for its issues only. The
 * instance's statuses it keeps stay as the settings make them; the statuses it adds are its own.
 */
export const saveProjectWorkflow = defineCommand({
  name: 'projectWorkflow.save',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema.extend(workflowRequestSchema.shape).superRefine(checkWorkflow),
  async handler(
    { tx, actor, project, log },
    { mode, statuses, transitions, removed },
  ): Promise<void> {
    // Locked until the transaction ends, as the instance's is when saved.
    const [copy] = await tx
      .select({ id: workflows.id })
      .from(workflows)
      .where(eq(workflows.projectId, project.id))
      .for('update');
    if (!copy) {
      throw new HttpError(409, 'NOT_CUSTOMIZED', 'This project follows the instance’s workflow');
    }
    const moved = await applyWorkflow(
      tx,
      actor.id,
      { workflowId: copy.id, projectId: project.id, followers: eq(issues.projectId, project.id) },
      { mode, statuses, transitions, removed },
    );
    log.info({ projectId: project.id, by: actor.id, moved }, 'Project workflow saved');
  },
});
