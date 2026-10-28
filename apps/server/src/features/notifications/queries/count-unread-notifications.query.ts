import { schema } from '@toppo-tracker/db';
import { and, count, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { seenBy } from '../utils/notification-rows.util.ts';

const { activities, issues, notifications, projects } = schema;

/** How many notifications the caller has not read, about issues they still see: the bell's count. */
export const countUnreadNotifications = defineQuery({
  name: 'notification.countUnread',
  access: 'authenticated',
  input: z.object({}),
  async handler({ db, actor }): Promise<{ count: number }> {
    const [unread] = await db
      .select({ count: count() })
      .from(notifications)
      .innerJoin(activities, eq(activities.id, notifications.activityId))
      .innerJoin(issues, eq(issues.id, activities.issueId))
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(
        and(eq(notifications.userId, actor.id), isNull(notifications.readAt), seenBy(actor.id)),
      );
    return { count: unread?.count ?? 0 };
  },
});
