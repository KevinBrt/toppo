import { issueSnapshotSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { type IssueEvent, issueEventOf } from '../../../platform/activities/issue-events.ts';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import type { HostCalls } from '../../../platform/plugins/host-calls.ts';

/**
 * The event a plugin hears of activity `activityId`, as the SDK promises it, or `null` when
 * there is nothing left to tell: the issue is gone or out of the plugin's reach, the comment or
 * the file deleted since.
 *
 * Hearing of an issue's events tells its plugin where it stands, not its words: the plugin reads
 * it even without `issue.read`, its description left out.
 */
export async function pluginEventOf(
  context: ExecutionContext & { actor: Actor },
  calls: HostCalls,
  activityId: string,
): Promise<IssueEvent | null> {
  const { plugin } = context.actor;
  if (!plugin) {
    return null;
  }
  const reading = {
    ...context,
    actor: { ...context.actor, plugin: { ...plugin, needs: [...plugin.needs, 'issue.read'] } },
  };
  return await issueEventOf(context.db, activityId, async ({ issueId }) => {
    const issue = await calls['issues.get'](reading, { issueId });
    return issue === null ? null : issueSnapshotSchema.parse(issue);
  });
}
