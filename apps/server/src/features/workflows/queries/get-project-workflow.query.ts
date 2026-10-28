import { schema } from '@toppo-tracker/db';
import { type ProjectWorkflowResponse, projectKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { instanceWorkflow, readWorkflow } from './get-workflow.query.ts';

const { issues, workflows } = schema;

/**
 * The workflow a project's issues follow: its own copy, or the instance's as it is. With the
 * project's issues on each status, and the instance's statuses, where issues go when the project
 * follows it again.
 */
export const getProjectWorkflow = defineQuery({
  name: 'projectWorkflow.get',
  access: { project: 'projectKey', permission: 'project.settings.manage' },
  input: projectKeyParamsSchema,
  async handler({ db, project }): Promise<ProjectWorkflowResponse> {
    const instance = await instanceWorkflow(db);
    const [copy] = await db
      .select({ id: workflows.id, mode: workflows.mode })
      .from(workflows)
      .where(eq(workflows.projectId, project.id));
    const followed = copy ?? instance;
    const [own, organization] = await Promise.all([
      readWorkflow(db, followed.id, eq(issues.projectId, project.id)),
      readWorkflow(db, instance.id, eq(issues.projectId, project.id)),
    ]);

    return {
      customized: copy !== undefined,
      mode: followed.mode,
      ...own,
      organization: organization.statuses.map(({ id, name, color, closes, isInitial }) => ({
        id,
        name,
        color,
        closes,
        isInitial,
      })),
    };
  },
});
