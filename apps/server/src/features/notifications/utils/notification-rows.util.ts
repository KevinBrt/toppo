import { type Db, schema } from '@toppo/db';
import {
  ISSUE_ACTIVITY_PAYLOADS,
  type LinkedIssue,
  type NotificationEvent,
  type NotificationReason,
  type UserRef,
} from '@toppo/shared';
import { and, eq, inArray, isNull, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { grantedIn, issuesSeenBy } from '../../../platform/auth/project-access.ts';

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

/** What a notification tells, as `eventOf` reads it from its activity. */
export interface Told {
  event: NotificationEvent;
  /** For a status change, the status the issue went to. */
  status: string | null;
  /** For a change of assignee told to another than the new assignee, whom it went to, by id. */
  assigneeId: string | null;
  /** For a duplicate mark, the issue it repeats, by id: named by the caller as the reader sees it. */
  originalId: string | null;
}

const NOTHING_MORE = { status: null, assigneeId: null, originalId: null } as const;

/** What a notification tells, from the activity it was made of and why it was given. */
export function eventOf(type: string, payload: unknown, reason: NotificationReason): Told {
  if (type === 'issue.statusChanged') {
    return {
      ...NOTHING_MORE,
      event: 'statusChanged',
      status: ISSUE_ACTIVITY_PAYLOADS['issue.statusChanged'].parse(payload).to.name,
    };
  }
  if (type === 'issue.duplicateChanged') {
    return {
      ...NOTHING_MORE,
      event: 'duplicateChanged',
      originalId: ISSUE_ACTIVITY_PAYLOADS['issue.duplicateChanged'].parse(payload).to,
    };
  }
  if (reason === 'assigned') {
    return { ...NOTHING_MORE, event: 'assigned' };
  }
  if (type === 'issue.assigneeChanged') {
    return {
      ...NOTHING_MORE,
      event: 'assigneeChanged',
      assigneeId: ISSUE_ACTIVITY_PAYLOADS['issue.assigneeChanged'].parse(payload).to,
    };
  }
  if (type === 'issue.created') {
    return { ...NOTHING_MORE, event: 'created' };
  }
  return { ...NOTHING_MORE, event: reason === 'mentioned' ? 'mentioned' : 'commented' };
}

/**
 * The issues notifications name as originals, by id, as `userId` sees them: key and title, or
 * `null`s for one gone or out of their sight.
 */
export async function originalsFor(
  db: Pick<Db, 'select'>,
  userId: string,
  ids: readonly string[],
): Promise<Map<string, LinkedIssue>> {
  const seen = await issuesSeenBy(db, userId, ids);
  return new Map(
    ids.map((id) => {
      const issue = seen.find((candidate) => candidate.id === id);
      return [id, issue ? { key: issue.key, title: issue.title } : { key: null, title: null }];
    }),
  );
}
