import { schema } from '@toppo-tracker/db';
import { issueKeyParamsSchema } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import { recordActivity } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { activity } from '../../utils/activities.util.ts';

const { issues } = schema;

/**
 * Takes the duplicate mark off an issue, which keeps its status: reopening it is another change.
 * Those who follow it are told.
 */
export const unmarkDuplicate = defineCommand({
  name: 'issue.unmarkDuplicate',
  access: { project: 'issueKey', permission: 'issue.update' },
  input: issueKeyParamsSchema,
  async handler({ tx, actor, project, log }): Promise<void> {
    const { issue } = project;
    const [current] = await tx
      .select({ duplicateOfId: issues.duplicateOfId })
      .from(issues)
      .where(eq(issues.id, issue.id))
      .for('update');
    if (!current) {
      throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
    }
    if (current.duplicateOfId === null) {
      return;
    }

    await tx.update(issues).set({ duplicateOfId: null }).where(eq(issues.id, issue.id));
    await recordActivity(tx, {
      projectId: project.id,
      issueId: issue.id,
      actorId: actor.id,
      ...activity('issue.duplicateChanged', { from: current.duplicateOfId, to: null }),
    });
    log.info(
      { issueId: issue.id, originalId: current.duplicateOfId, by: actor.id },
      'Issue no longer a duplicate',
    );
  },
});
