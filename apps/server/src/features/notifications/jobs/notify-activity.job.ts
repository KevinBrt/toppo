import { type NotifiedChange, recipientsOf } from '@toppo/core';
import { schema } from '@toppo/db';
import { ISSUE_ACTIVITY_PAYLOADS } from '@toppo/shared';
import { eq } from 'drizzle-orm';
import { ACTIVITY_RECORDED } from '../../../platform/activities/record-activity.ts';
import { whoSeesIssue } from '../../../platform/auth/project-access.ts';
import { defineJob } from '../../../platform/jobs/jobs.ts';
import { newIssueSubscribers } from '../utils/notification-rows.util.ts';
import { emailNotifications } from './email-notification.job.ts';

const { activities, comments, issues, notifications } = schema;

/**
 * Tells the people concerned about a change to an issue (`recipientsOf`): those whose account is
 * active and who still see the issue get a notification, once, emailed later when email is set
 * up. Queued with each activity (`recordActivity`); an activity gone with its issue tells nobody.
 */
export const notifyActivityJob = defineJob({
  type: ACTIVITY_RECORDED.type,
  payload: ACTIVITY_RECORDED.payload,
  async handler({ tx, services }, { activityId }) {
    const [activity] = await tx
      .select({
        type: activities.type,
        payload: activities.payload,
        actorId: activities.actorId,
        issueId: issues.id,
        projectId: issues.projectId,
        reporterId: issues.reporterId,
        assigneeId: issues.assigneeId,
      })
      .from(activities)
      .innerJoin(issues, eq(issues.id, activities.issueId))
      .where(eq(activities.id, activityId));
    if (!activity) {
      return;
    }
    const change: NotifiedChange =
      activity.type === 'issue.created'
        ? {
            type: 'issue.created',
            actorId: activity.actorId,
            assigneeId: ISSUE_ACTIVITY_PAYLOADS['issue.created'].parse(activity.payload).assigneeId,
            subscriberIds: await newIssueSubscribers(tx, activity.projectId),
          }
        : changeOf(activity.type, activity.actorId, activity.payload);
    const commenters =
      change.type === 'issue.commented'
        ? await tx
            .selectDistinct({ authorId: comments.authorId })
            .from(comments)
            .where(eq(comments.issueId, activity.issueId))
        : [];
    const recipients = recipientsOf(change, {
      reporterId: activity.reporterId,
      assigneeId: activity.assigneeId,
      commenterIds: commenters.map(({ authorId }) => authorId),
    });
    const told = await whoSeesIssue(tx, activity.issueId, [...recipients.keys()]);
    if (told.length === 0) {
      return;
    }
    const made = await tx
      .insert(notifications)
      .values(
        told.map((userId) => ({
          userId,
          activityId,
          reason: recipients.get(userId) ?? 'participating',
        })),
      )
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    await emailNotifications(tx, services, made);
  },
});

/** A stored activity as `recipientsOf` reads it. */
function changeOf(type: string, actorId: string, payload: unknown): NotifiedChange {
  switch (type) {
    case 'issue.assigneeChanged':
      return {
        type,
        actorId,
        assigneeId: ISSUE_ACTIVITY_PAYLOADS['issue.assigneeChanged'].parse(payload).to,
      };
    case 'issue.commented':
    case 'issue.commentEdited':
      return {
        type,
        actorId,
        mentioned: ISSUE_ACTIVITY_PAYLOADS[type].parse(payload).mentioned,
      };
    case 'issue.statusChanged':
      return { type, actorId };
    default:
      return { type: 'other', actorId };
  }
}
