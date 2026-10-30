import { type Db, schema } from '@toppo-tracker/db';
import {
  EVENT_TYPES,
  type EventType,
  eventPayloadSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import { ISSUE_ACTIVITY_PAYLOADS } from '@toppo-tracker/shared';
import { eq } from 'drizzle-orm';

const { activities, attachments, comments } = schema;

/**
 * Activities told outside Toppo's own people, as events: the plugins' (`plugin-sdk/protocol`) and
 * the webhooks', one format for both. What an event tells of its issue is each one's to read: a
 * plugin within its reach, a webhook as the instance's administrators chose.
 */

/** An activity as `readIssue` is given it: which issue, in which project. */
export interface EventActivity {
  id: string;
  type: EventType;
  projectId: string;
  issueId: string;
}

/** An event, checked against the SDK's format: the event, its issue as read, what changed. */
export interface IssueEvent {
  type: EventType;
  payload: ReturnType<ReturnType<typeof eventPayloadSchema>['parse']>;
}

function isEventType(type: string): type is EventType {
  return EVENT_TYPES.some((known) => known === type);
}

/**
 * The event activity `activityId` tells, or `null` when there is nothing left to tell: an
 * activity no event names, an issue gone or out of reach (`readIssue` answers `null`), the
 * comment or the file deleted since. A deleted issue is told by its id, key and project.
 */
export async function issueEventOf(
  db: Db,
  activityId: string,
  readIssue: (activity: EventActivity) => Promise<unknown>,
): Promise<IssueEvent | null> {
  const [activity] = await db.select().from(activities).where(eq(activities.id, activityId));
  if (!(activity && isEventType(activity.type))) {
    return null;
  }
  const { type } = activity;
  const issue = await issueOf(activity, type, readIssue);
  const change = await changeOf(db, type, activity.payload);
  if (issue === null || change === null) {
    return null;
  }
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

async function issueOf(
  activity: typeof activities.$inferSelect,
  type: EventType,
  readIssue: (activity: EventActivity) => Promise<unknown>,
): Promise<unknown> {
  if (type === 'issue.deleted') {
    const { key, issueId } = ISSUE_ACTIVITY_PAYLOADS['issue.deleted'].parse(activity.payload);
    // Deleted before Toppo kept the id of what it deletes: nobody heard of it then.
    return issueId === undefined ? null : { id: issueId, key, projectId: activity.projectId };
  }
  if (activity.issueId === null) {
    return null;
  }
  return await readIssue({
    id: activity.id,
    type,
    projectId: activity.projectId,
    issueId: activity.issueId,
  });
}

/** What changed, as the SDK names it: a comment or a file with what it holds. */
async function changeOf(db: Db, type: EventType, payload: unknown): Promise<unknown> {
  switch (type) {
    case 'issue.commented':
    case 'issue.commentEdited': {
      const { commentId, mentioned } = ISSUE_ACTIVITY_PAYLOADS[type].parse(payload);
      const [comment] = await db
        .select({ id: comments.id, authorId: comments.authorId, body: comments.body })
        .from(comments)
        .where(eq(comments.id, commentId));
      return comment ? { comment: { ...comment, mentioned } } : null;
    }
    case 'issue.attachmentAdded': {
      const { attachmentId } = ISSUE_ACTIVITY_PAYLOADS[type].parse(payload);
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
      return payload;
  }
}
