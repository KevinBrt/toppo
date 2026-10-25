import { schema } from '@toppo/db';
import {
  type BulkIssuesResponse,
  bulkDeleteRequestSchema,
  projectIssuesParamsSchema,
} from '@toppo/shared';
import { inArray } from 'drizzle-orm';
import { recordActivities } from '../../../../platform/activities/record-activity.ts';
import { defineCommand } from '../../../../platform/cqrs/cqrs.ts';
import { activity } from '../../utils/activities.util.ts';
import { bulkOutcome, issuesToChange } from '../../utils/bulk-issues.util.ts';

const { issues } = schema;

/**
 * Deletes several issues of a project for good, as `issue.delete` does each: their history goes
 * with them, one activity outside each keeps its key and who deleted it, and nobody is told.
 */
export const bulkDeleteIssues = defineCommand({
  name: 'issue.bulkDelete',
  access: { project: 'projectKey', permission: 'issue.delete' },
  input: projectIssuesParamsSchema.extend(bulkDeleteRequestSchema.shape),
  async handler({ tx, actor, project, log }, { issueKeys }): Promise<BulkIssuesResponse> {
    const { found, missing } = await issuesToChange(tx, actor, project, issueKeys);
    if (found.length === 0) {
      return bulkOutcome(issueKeys, [], [], missing);
    }

    await tx.delete(issues).where(
      inArray(
        issues.id,
        found.map(({ id }) => id),
      ),
    );
    await recordActivities(
      tx,
      found.map((issue) => ({
        projectId: project.id,
        issueId: null,
        actorId: actor.id,
        ...activity('issue.deleted', { key: issue.key }),
      })),
      { notify: false },
    );
    log.info(
      { projectId: project.id, keys: found.map(({ key }) => key), by: actor.id },
      'Issues deleted',
    );
    return bulkOutcome(issueKeys, found, [], missing);
  },
});
