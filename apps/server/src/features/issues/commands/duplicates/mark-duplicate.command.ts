import { canMoveTo, closedAtFor } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { issueKeyParamsSchema, markDuplicateRequestSchema } from '@toppo-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { recordActivity } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { HttpError } from '../../../../platform/http/http-error.ts';
import { activity } from '../../utils/activities.util.ts';
import { issueSeenBy, wouldLoop } from '../../utils/duplicates.util.ts';
import { movesOf } from '../change-issue-status.command.ts';

const { issueFollowers, issues, statuses } = schema;

/**
 * Marks an issue as a duplicate of another the caller sees, in any project, and closes it in the
 * closing status they choose, one its workflow allows from its own (an issue closed already may
 * keep its status). Those who follow it are told of the mark, not of the move; its reporter now
 * follows the original, unless they chose not to.
 */
export const markDuplicate = defineCommand({
  name: 'issue.markDuplicate',
  access: { project: 'issueKey', permission: 'issue.update' },
  input: issueKeyParamsSchema.extend(markDuplicateRequestSchema.shape),
  async handler({ tx, actor, project, log }, { originalKey, statusId }): Promise<void> {
    const { issue } = project;
    // Locked: two marks of the same issue apply one after the other.
    const [current] = await tx
      .select({
        statusId: issues.statusId,
        closedAt: issues.closedAt,
        duplicateOfId: issues.duplicateOfId,
        reporterId: issues.reporterId,
      })
      .from(issues)
      .where(eq(issues.id, issue.id))
      .for('update');
    if (!current) {
      throw new HttpError(404, 'ISSUE_NOT_FOUND', 'This issue does not exist');
    }
    const original = await issueSeenBy(tx, actor.id, originalKey);
    if (!original) {
      throw new HttpError(400, 'ORIGINAL_NOT_FOUND', 'The original issue does not exist');
    }
    if (await wouldLoop(tx, issue.id, original.id)) {
      throw new HttpError(409, 'DUPLICATE_CYCLE', 'An issue cannot duplicate itself');
    }
    const named = await tx
      .select({ id: statuses.id, name: statuses.name, closes: statuses.closes })
      .from(statuses)
      .where(inArray(statuses.id, [current.statusId, statusId]));
    const from = named.find(({ id }) => id === current.statusId);
    const to = named.find(({ id }) => id === statusId);
    const moves = statusId !== current.statusId;
    if (
      !(from && to?.closes) ||
      (moves && !canMoveTo(await movesOf(tx, project.id, current.statusId), from.id, to.id))
    ) {
      throw new HttpError(
        409,
        'STATUS_NOT_ALLOWED',
        'The workflow does not close the issue in this status from its own',
      );
    }
    const marks = current.duplicateOfId !== original.id;
    if (!(moves || marks)) {
      return;
    }

    await tx
      .update(issues)
      .set({
        duplicateOfId: original.id,
        statusId,
        closedAt: closedAtFor(to.closes, current.closedAt, new Date()),
      })
      .where(eq(issues.id, issue.id));
    if (marks) {
      await recordActivity(tx, {
        projectId: project.id,
        issueId: issue.id,
        actorId: actor.id,
        ...activity('issue.duplicateChanged', { from: current.duplicateOfId, to: original.id }),
      });
      await tx
        .insert(issueFollowers)
        .values({ issueId: original.id, userId: current.reporterId, following: true })
        .onConflictDoNothing();
    }
    if (moves) {
      // Told with the mark, which says why it closes; alone otherwise.
      await recordActivity(
        tx,
        {
          projectId: project.id,
          issueId: issue.id,
          actorId: actor.id,
          ...activity('issue.statusChanged', {
            from: { id: from.id, name: from.name },
            to: { id: to.id, name: to.name },
          }),
        },
        { notify: !marks },
      );
    }
    log.info(
      { issueId: issue.id, originalId: original.id, statusId, by: actor.id },
      'Issue marked as a duplicate',
    );
  },
});
