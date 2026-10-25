import { type Db, schema } from '@toppo/db';
import {
  ISSUE_ACTIVITY_PAYLOADS,
  type NotificationEvent,
  type NotificationReason,
  type UserRef,
} from '@toppo/shared';
import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
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

/** People by id, named as they are now: a deleted account keeps its id, not its name. */
export async function peopleNamed(
  db: Pick<Db, 'select'>,
  ids: readonly string[],
): Promise<Map<string, UserRef>> {
  if (ids.length === 0) {
    return new Map();
  }
  const found = await db
    .select({ id: users.id, name: users.name, deletedAt: users.deletedAt })
    .from(users)
    .where(inArray(users.id, [...new Set(ids)]));
  return new Map(
    found.map(({ id, name, deletedAt }) => [id, { id, name: deletedAt ? null : name }]),
  );
}

/**
 * What a notification tells, from the activity it was made of and why it was given; for a change
 * of assignee told to another than the new assignee, the id of whom the issue went to, named by
 * the caller.
 */
export function eventOf(
  type: string,
  payload: unknown,
  reason: NotificationReason,
): { event: NotificationEvent; status: string | null; assigneeId: string | null } {
  if (type === 'issue.statusChanged') {
    return {
      event: 'statusChanged',
      status: ISSUE_ACTIVITY_PAYLOADS['issue.statusChanged'].parse(payload).to.name,
      assigneeId: null,
    };
  }
  if (reason === 'assigned') {
    return { event: 'assigned', status: null, assigneeId: null };
  }
  if (type === 'issue.assigneeChanged') {
    return {
      event: 'assigneeChanged',
      status: null,
      assigneeId: ISSUE_ACTIVITY_PAYLOADS['issue.assigneeChanged'].parse(payload).to,
    };
  }
  if (type === 'issue.created') {
    return { event: 'created', status: null, assigneeId: null };
  }
  return {
    event: reason === 'mentioned' ? 'mentioned' : 'commented',
    status: null,
    assigneeId: null,
  };
}
