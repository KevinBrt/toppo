import { formatIssueKey } from '@toppo/core';
import { schema } from '@toppo/db';
import {
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationsResponse,
  notificationsQuerySchema,
  projectKeySchema,
} from '@toppo/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { eventOf, seenBy } from '../utils/notification-rows.util.ts';

const { activities, issues, notifications, projects, users } = schema;

/**
 * One page of the caller's notifications, the latest first, about issues they still see: what
 * happened, who did it, on which issue, and whether they read it.
 */
export const listNotifications = defineQuery({
  name: 'notification.list',
  access: 'authenticated',
  input: notificationsQuerySchema,
  async handler({ db, actor }, { page }): Promise<NotificationsResponse> {
    const mine = and(eq(notifications.userId, actor.id), seenBy(actor.id));
    const rows = await db
      .select({
        id: notifications.id,
        reason: notifications.reason,
        readAt: notifications.readAt,
        createdAt: notifications.createdAt,
        type: activities.type,
        payload: activities.payload,
        actor: { id: users.id, name: users.name, deletedAt: users.deletedAt },
        issue: { number: issues.number, title: issues.title, projectKey: projects.key },
      })
      .from(notifications)
      .innerJoin(activities, eq(activities.id, notifications.activityId))
      .innerJoin(issues, eq(issues.id, activities.issueId))
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .innerJoin(users, eq(users.id, activities.actorId))
      .where(mine)
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(NOTIFICATIONS_PAGE_SIZE)
      .offset((page - 1) * NOTIFICATIONS_PAGE_SIZE);
    const [total] = await db
      .select({ count: count() })
      .from(notifications)
      .innerJoin(activities, eq(activities.id, notifications.activityId))
      .innerJoin(issues, eq(issues.id, activities.issueId))
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(mine);

    return {
      rows: rows.map((row) => ({
        id: row.id,
        ...eventOf(row.type, row.payload, row.reason),
        actor: { id: row.actor.id, name: row.actor.deletedAt ? null : row.actor.name },
        issue: {
          key: formatIssueKey({
            projectKey: projectKeySchema.parse(row.issue.projectKey),
            number: row.issue.number,
          }),
          title: row.issue.title,
        },
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      matching: total?.count ?? 0,
      page,
      pageSize: NOTIFICATIONS_PAGE_SIZE,
    };
  },
});
