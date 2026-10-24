import { schema } from '@toppo/db';
import { assignIssueRequestSchema, issueKeyParamsSchema } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { recordActivity } from '../../../platform/activities/record-activity.ts';
import { defineCommand, type Transaction } from '../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../platform/http/http-error.ts';
import { activity } from '../utils/activities.util.ts';
import { reachesProject } from '../utils/people.util.ts';

const { issues } = schema;

/** Gives an issue to someone who reaches its project, or to nobody (`null`). */
export const assignIssue = defineCommand({
  name: 'issue.assign',
  access: { project: 'issueKey', permission: 'issue.assign' },
  input: issueKeyParamsSchema.extend(assignIssueRequestSchema.shape),
  async handler({ tx, actor, project, log }, { assigneeId }): Promise<void> {
    // Locked: two people assigning the same issue are serialized, and history follows the order.
    const [current] = await tx
      .select({ assigneeId: issues.assigneeId })
      .from(issues)
      .where(eq(issues.id, project.issue.id))
      .for('update');
    if (!current) {
      throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
    }
    if (current.assigneeId === assigneeId) {
      return;
    }
    if (assigneeId) {
      await assertAssignable(tx, project.id, assigneeId);
    }

    await tx.update(issues).set({ assigneeId }).where(eq(issues.id, project.issue.id));
    await recordActivity(tx, {
      projectId: project.id,
      issueId: project.issue.id,
      actorId: actor.id,
      ...activity('issue.assigneeChanged', { from: current.assigneeId, to: assigneeId }),
    });
    log.info({ issueId: project.issue.id, assigneeId, by: actor.id }, 'Issue assigned');
  },
});

/** Only an active member who reaches the project can be given an issue of it. */
export async function assertAssignable(
  tx: Transaction,
  projectId: string,
  userId: string,
): Promise<void> {
  if (!(await reachesProject(tx, projectId, userId))) {
    throw new HttpError(400, 'INVALID_ASSIGNEE', 'This person cannot be given issues here');
  }
}
