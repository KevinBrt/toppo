import { formatIssueKey } from '@toppo-tracker/core';
import { schema } from '@toppo-tracker/db';
import { ISSUE_ACTIVITY_PAYLOADS, projectKeySchema } from '@toppo-tracker/shared';
import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { whoSeesIssue } from '../../../platform/auth/project-access.ts';
import type { Services, Transaction } from '../../../platform/cqrs/cqrs.ts';
import { defineJob, enqueue } from '../../../platform/jobs/jobs.ts';
import { notificationMail } from '../utils/notification-mail.util.ts';
import { eventOf, originalsFor, peopleNamed } from '../utils/notification-rows.util.ts';

const { activities, comments, issues, notifications, projects, users } = schema;
const recipients = alias(users, 'recipients');
const actors = alias(users, 'actors');

/** Long enough for someone at work in Toppo to read it there first, and get no email. */
export const NOTIFICATION_EMAIL_DELAY_MS = 5 * 60 * 1000;

/**
 * Emails a notification, a few minutes after it came: not if it was read in Toppo meanwhile, if
 * its recipient turned that kind of email off, can no longer see the issue, or email is off.
 */
export const emailNotificationJob = defineJob({
  type: 'notification.email',
  payload: z.object({ notificationId: z.uuid() }),
  async handler({ tx, services, log }, { notificationId }) {
    const [row] = await tx
      .select({
        reason: notifications.reason,
        recipient: {
          id: recipients.id,
          name: recipients.name,
          email: recipients.email,
          locale: recipients.locale,
          mutedEvents: recipients.emailMutedEvents,
        },
        type: activities.type,
        payload: activities.payload,
        actor: { name: actors.name, deletedAt: actors.deletedAt },
        issue: {
          id: issues.id,
          number: issues.number,
          title: issues.title,
          description: issues.description,
          projectKey: projects.key,
        },
      })
      .from(notifications)
      .innerJoin(recipients, eq(recipients.id, notifications.userId))
      .innerJoin(activities, eq(activities.id, notifications.activityId))
      .innerJoin(actors, eq(actors.id, activities.actorId))
      .innerJoin(issues, eq(issues.id, activities.issueId))
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(and(eq(notifications.id, notificationId), isNull(notifications.readAt)));
    const told = row ? eventOf(row.type, row.payload, row.reason) : null;
    const wanted =
      row !== undefined &&
      told !== null &&
      !row.recipient.mutedEvents.includes(told.event) &&
      (await whoSeesIssue(tx, row.issue.id, [row.recipient.id])).length === 1 &&
      (await services.mailer.isConfigured(tx));
    if (!(row && told && wanted)) {
      log.info({ notificationId }, 'Notification no longer to email');
      return;
    }
    const { event, status, assigneeId, originalId } = told;
    const assignee = assigneeId ? (await peopleNamed(tx, [assigneeId])).get(assigneeId) : null;
    const original = originalId
      ? (await originalsFor(tx, row.recipient.id, [originalId])).get(originalId)
      : null;
    const key = formatIssueKey({
      projectKey: projectKeySchema.parse(row.issue.projectKey),
      number: row.issue.number,
    });
    await services.mailer.send(tx, {
      to: { name: row.recipient.name, address: row.recipient.email },
      ...notificationMail(row.recipient.locale, {
        event,
        actor: row.actor.deletedAt ? null : row.actor.name,
        key,
        title: row.issue.title,
        status,
        assignee: assignee ? { name: assignee.name } : null,
        original: original ?? null,
        quote:
          row.type === 'issue.created'
            ? row.issue.description
            : await commentOf(tx, row.type, row.payload),
        issueLink: new URL(`/issues/${key}`, services.publicUrl),
        accountLink: new URL('/account', services.publicUrl),
      }),
    });
    log.info({ notificationId }, 'Notification emailed');
  },
});

/** The words of the comment an activity is about, if it is about one still there. */
async function commentOf(tx: Transaction, type: string, payload: unknown): Promise<string | null> {
  if (type !== 'issue.commented' && type !== 'issue.commentEdited') {
    return null;
  }
  const { commentId } = ISSUE_ACTIVITY_PAYLOADS[type].parse(payload);
  const [comment] = await tx
    .select({ body: comments.body })
    .from(comments)
    .where(eq(comments.id, commentId));
  return comment?.body ?? null;
}

/** Queues the email of each notification just made, for later, if email is set up. */
export async function emailNotifications(
  tx: Transaction,
  services: Services,
  made: readonly { id: string }[],
): Promise<void> {
  if (made.length === 0 || !(await services.mailer.isConfigured(tx))) {
    return;
  }
  const runAt = new Date(Date.now() + NOTIFICATION_EMAIL_DELAY_MS);
  for (const { id } of made) {
    await enqueue(tx, emailNotificationJob, { notificationId: id }, { runAt });
  }
}
