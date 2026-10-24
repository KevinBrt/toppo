import { schema } from '@toppo/db';
import { issueKeyParamsSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';
import { activity } from '../utils/activities.util.ts';

const { issues } = schema;

/**
 * Deletes an issue for good, its history with it. One activity, outside the issue, keeps its key
 * and who deleted it; its number is never given again (the project's counter only goes up).
 */
export const deleteIssue = defineCommand({
  name: 'issue.delete',
  access: { project: 'issueKey', permission: 'issue.delete' },
  input: issueKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    await tx.delete(issues).where(eq(issues.id, project.issue.id));
    // Recorded for history and audit; nobody is told about an issue that is gone.
    await recordActivity(
      tx,
      {
        projectId: project.id,
        issueId: null,
        actorId: actor.id,
        ...activity('issue.deleted', { key: project.issue.key }),
      },
      { notify: false },
    );
    log.info({ issueId: project.issue.id, key: project.issue.key, by: actor.id }, 'Issue deleted');
  },
});
