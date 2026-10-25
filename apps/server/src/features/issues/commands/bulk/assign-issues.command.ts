import { schema } from '@toppo/db';
import {
  type BulkIssuesResponse,
  bulkAssigneeRequestSchema,
  projectIssuesParamsSchema,
} from '@toppo/shared';
import { inArray } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { activity } from '../../utils/activities.util.ts';
import { bulkOutcome, issuesToChange } from '../../utils/bulk-issues.util.ts';
import { assertAssignable } from '../assign-issue.command.ts';

const { issues } = schema;

/**
 * Gives several issues of a project to someone who reaches it, or to nobody (`null`), each told
 * and recorded as if given alone. An issue already theirs is left as it is.
 */
export const bulkAssignIssues = defineCommand({
  name: 'issue.bulkAssign',
  access: { project: 'projectKey', permission: 'issue.assign' },
  input: projectIssuesParamsSchema.extend(bulkAssigneeRequestSchema.shape),
  async handler(
    { tx, actor, project, log },
    { issueKeys, assigneeId },
  ): Promise<BulkIssuesResponse> {
    if (assigneeId) {
      await assertAssignable(tx, project.id, assigneeId);
    }
    const { found, missing } = await issuesToChange(tx, actor, project, issueKeys);
    const changed = found.filter((issue) => issue.assigneeId !== assigneeId);
    if (changed.length === 0) {
      return bulkOutcome(issueKeys, [], [], missing);
    }

    await tx
      .update(issues)
      .set({ assigneeId })
      .where(
        inArray(
          issues.id,
          changed.map(({ id }) => id),
        ),
      );
    await recordActivities(
      tx,
      changed.map((issue) => ({
        projectId: project.id,
        issueId: issue.id,
        actorId: actor.id,
        ...activity('issue.assigneeChanged', { from: issue.assigneeId, to: assigneeId }),
      })),
    );
    log.info(
      { projectId: project.id, assigneeId, changed: changed.length, by: actor.id },
      'Issues assigned',
    );
    return bulkOutcome(issueKeys, changed, [], missing);
  },
});
