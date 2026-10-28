import { schema } from '@toppo-tracker/db';
import { issueFollowingRequestSchema, issueKeyParamsSchema } from '@toppo-tracker/shared';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { issueFollowers } = schema;

/**
 * Follows an issue the caller sees, or stops following it: until they change their mind, they
 * are told of its comments, status changes and assignments, or no longer, even if they take part
 * in it. Not a change to the issue: no activity is recorded.
 */
export const followIssue = defineCommand({
  name: 'issue.follow',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema.extend(issueFollowingRequestSchema.shape),
  async handler({ tx, actor, project }, { following }): Promise<void> {
    await tx
      .insert(issueFollowers)
      .values({ issueId: project.issue.id, userId: actor.id, following })
      .onConflictDoUpdate({
        target: [issueFollowers.issueId, issueFollowers.userId],
        set: { following },
      });
  },
});
