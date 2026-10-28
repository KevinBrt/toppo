import { canMoveTo, closedAtFor, type WorkflowMoves } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import {
  type BulkIssuesResponse,
  bulkStatusRequestSchema,
  projectIssuesParamsSchema,
} from '@toppo-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { activity } from '../../utils/activities.util.ts';
import { type BulkIssue, bulkOutcome, issuesToChange } from '../../utils/bulk-issues.util.ts';
import { movesOf } from '../change-issue-status.command.ts';

const { issues, statuses } = schema;

/**
 * Moves several issues of a project to a status, each as `issue.changeStatus` would: those whose
 * workflow does not allow it from their own status are refused, the others move, each told and
 * recorded as if moved alone.
 */
export const bulkChangeStatus = defineCommand({
  name: 'issue.bulkChangeStatus',
  access: { project: 'projectKey', permission: 'issue.update' },
  input: projectIssuesParamsSchema.extend(bulkStatusRequestSchema.shape),
  async handler({ tx, actor, project, log }, { issueKeys, statusId }): Promise<BulkIssuesResponse> {
    const { found, missing } = await issuesToChange(tx, actor, project, issueKeys);
    const moving = found.filter((issue) => issue.statusId !== statusId);
    const movesFrom = new Map<string, WorkflowMoves>();
    for (const from of new Set(moving.map((issue) => issue.statusId))) {
      movesFrom.set(from, await movesOf(tx, project.id, from));
    }
    const allowed = (issue: BulkIssue) => {
      const moves = movesFrom.get(issue.statusId);
      return moves !== undefined && canMoveTo(moves, issue.statusId, statusId);
    };
    const moved = moving.filter(allowed);
    const refused = moving
      .filter((issue) => !allowed(issue))
      .map(({ key }) => ({ key, code: 'STATUS_NOT_ALLOWED' as const }));
    if (moved.length === 0) {
      return bulkOutcome(issueKeys, [], refused, missing);
    }

    const named = await tx
      .select({ id: statuses.id, name: statuses.name, closes: statuses.closes })
      .from(statuses)
      .where(inArray(statuses.id, [statusId, ...moved.map((issue) => issue.statusId)]));
    const nameOf = (id: string) => {
      const status = named.find((candidate) => candidate.id === id);
      if (!status) {
        throw new Error('A status of the workflow is missing');
      }
      return status;
    };
    const to = nameOf(statusId);
    const now = new Date();
    // One by one: each issue keeps the moment it was first closed, if it was.
    for (const issue of moved) {
      await tx
        .update(issues)
        .set({ statusId, closedAt: closedAtFor(to.closes, issue.closedAt, now) })
        .where(eq(issues.id, issue.id));
    }
    await recordActivities(
      tx,
      moved.map((issue) => {
        const from = nameOf(issue.statusId);
        return {
          projectId: project.id,
          issueId: issue.id,
          actorId: actor.id,
          ...activity('issue.statusChanged', {
            from: { id: from.id, name: from.name },
            to: { id: to.id, name: to.name },
          }),
        };
      }),
    );
    log.info(
      {
        projectId: project.id,
        statusId,
        moved: moved.length,
        refused: refused.length,
        by: actor.id,
      },
      'Issues moved',
    );
    return bulkOutcome(issueKeys, moved, refused, missing);
  },
});
