import { schema } from '@toppo-tracker/db';
import {
  EVENT_TYPES,
  type EventType,
  eventPayloadSchema,
  issueSnapshotSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import { ISSUE_ACTIVITY_PAYLOADS } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../../platform/auth/actor.ts';
import type { ExecutionContext } from '../../../platform/cqrs/cqrs.ts';
import type { HostCalls } from '../../../platform/plugins/host-calls.ts';

const { activities, attachments, comments } = schema;

type Activity = typeof activities.$inferSelect;

/** What a plugin's handler receives: the event, the issue as it stands now, what changed. */
export interface PluginEvent {
  type: EventType;
  payload: unknown;
}

function isEventType(type: string): type is EventType {
  return EVENT_TYPES.some((known) => known === type);
}

/**
 * The event a plugin hears of activity `activityId`, as the SDK promises it, or `null` when
 * there is nothing left to tell: the issue is gone or out of the plugin's reach, the comment or
 * the file deleted since.
 */
export async function pluginEventOf(
  context: ExecutionContext & { actor: Actor },
  calls: HostCalls,
  activityId: string,
): Promise<PluginEvent | null> {
  const [activity] = await context.db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId));
  if (!(activity && isEventType(activity.type))) {
    return null;
  }
  const issue = await issueOf(context, calls, activity);
  const change = await changeOf(context, activity);
  if (issue === null || change === null) {
    return null;
  }
  const { type } = activity;
  return {
    type,
    payload: eventPayloadSchema(type).parse({
      event: {
        id: activity.id,
        type,
        occurredAt: activity.createdAt.toISOString(),
        actorId: activity.actorId,
      },
      issue,
      change,
    }),
  };
}

/**
 * The issue an event tells of, as it stands now. Hearing of an issue's events tells its plugin
 * where it stands, not its words: the plugin reads it even without `issue.read`, its description
 * left out.
 */
async function issueOf(
  context: ExecutionContext & { actor: Actor },
  calls: HostCalls,
  activity: Activity,
): Promise<unknown> {
  if (activity.type === 'issue.deleted') {
    const { key, issueId } = ISSUE_ACTIVITY_PAYLOADS['issue.deleted'].parse(activity.payload);
    // Deleted before Toppo kept the id of what it deletes: no plugin heard of it then.
    return issueId === undefined ? null : { id: issueId, key, projectId: activity.projectId };
  }
  const { plugin } = context.actor;
  if (activity.issueId === null || !plugin) {
    return null;
  }
  const reading = {
    ...context,
    actor: { ...context.actor, plugin: { ...plugin, needs: [...plugin.needs, 'issue.read'] } },
  };
  const issue = await calls['issues.get'](reading, { issueId: activity.issueId });
  return issue === null ? null : issueSnapshotSchema.parse(issue);
}

/** What changed, as the SDK names it: a comment or a file with what it holds. */
async function changeOf({ db }: ExecutionContext, activity: Activity): Promise<unknown> {
  switch (activity.type) {
    case 'issue.commented':
    case 'issue.commentEdited': {
      const { commentId, mentioned } = ISSUE_ACTIVITY_PAYLOADS[activity.type].parse(
        activity.payload,
      );
      const [comment] = await db
        .select({ id: comments.id, authorId: comments.authorId, body: comments.body })
        .from(comments)
        .where(eq(comments.id, commentId));
      return comment ? { comment: { ...comment, mentioned } } : null;
    }
    case 'issue.attachmentAdded': {
      const { attachmentId } = ISSUE_ACTIVITY_PAYLOADS[activity.type].parse(activity.payload);
      const [attachment] = await db
        .select({
          id: attachments.id,
          fileName: attachments.fileName,
          mediaType: attachments.mediaType,
          size: attachments.size,
        })
        .from(attachments)
        .where(eq(attachments.id, attachmentId));
      return attachment ? { attachment } : null;
    }
    default:
      // The others say what changed as the SDK does: what it does not promise is left out.
      return activity.payload;
  }
}
