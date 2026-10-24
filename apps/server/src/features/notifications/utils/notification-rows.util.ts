import { type Db, schema } from '@toppo/db';
import {
  ISSUE_ACTIVITY_PAYLOADS,
  type NotificationEvent,
  type NotificationReason,
} from '@toppo/shared';
import { and, eq, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { grantedIn } from '../../../platform/auth/project-access.ts';

const { issues, projectMembers, roles, users } = schema;
const instanceRoles = alias(roles, 'instance_roles');
const memberRoles = alias(roles, 'member_roles');

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

/**
 * The active people of a project whose role there tells them of new issues: the one the project
 * gives them, or else their own; the system role whatever the project gives (`roleInProject`).
 * Whether they may see a given issue is checked by the caller.
 */
export async function newIssueSubscribers(
  db: Pick<Db, 'select'>,
  projectId: string,
): Promise<string[]> {
  const people = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(instanceRoles, eq(instanceRoles.id, users.instanceRoleId))
    .leftJoin(
      projectMembers,
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, users.id)),
    )
    .leftJoin(memberRoles, eq(memberRoles.id, projectMembers.roleId))
    .where(
      and(
        isNull(users.deactivatedAt),
        isNull(users.deletedAt),
        sql`case when ${instanceRoles.grantsAll} then ${instanceRoles.notifyNewIssues}
          else coalesce(${memberRoles.notifyNewIssues}, ${instanceRoles.notifyNewIssues}) end`,
      ),
    );
  return people.map(({ id }) => id);
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
  if (type === 'issue.assigneeChanged' || reason === 'assigned') {
    return { event: 'assigned', status: null };
  }
  if (type === 'issue.created') {
    return { event: 'created', status: null };
  }
  return { event: reason === 'mentioned' ? 'mentioned' : 'commented', status: null };
}
