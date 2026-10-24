import { schema } from '@toppo/db';
import {
  ISSUE_ACTIVITY_PAYLOADS,
  type NotificationEvent,
  type NotificationReason,
} from '@toppo/shared';
import { and, eq, or, type SQL } from 'drizzle-orm';
import { grantedIn } from '../../../platform/auth/project-access.ts';

const { issues } = schema;

/**
 * The issues `userId` still sees, as a condition on `issues` and `projects`: every issue where
 * they hold `issue.read`, those they reported where they hold `issue.read.own`. A notification
 * about an issue out of their sight is not shown, though kept.
 */
export function seenBy(userId: string): SQL {
  return or(
    grantedIn(userId, ['issue.read']),
    and(eq(issues.reporterId, userId), grantedIn(userId, ['issue.read.own'])),
  ) as SQL;
}

/** What a notification tells, from the activity it was made of and why it was given. */
export function eventOf(
  type: string,
  payload: unknown,
  reason: NotificationReason,
): { event: NotificationEvent; status: string | null } {
  if (type === 'issue.statusChanged') {
    return {
      event: 'statusChanged',
      status: ISSUE_ACTIVITY_PAYLOADS['issue.statusChanged'].parse(payload).to.name,
    };
  }
  if (type === 'issue.assigneeChanged') {
    return { event: 'assigned', status: null };
  }
  return { event: reason === 'mentioned' ? 'mentioned' : 'commented', status: null };
}
