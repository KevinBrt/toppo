import { schema } from '@toppo/db';
import { readNotificationsRequestSchema } from '@toppo/shared';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { defineCommand } from '../../../platform/cqrs/cqrs.ts';

const { notifications } = schema;

/** Marks some of the caller's notifications read, or all of them; those of others are left alone. */
export const readNotifications = defineCommand({
  name: 'notification.read',
  access: 'authenticated',
  input: readNotificationsRequestSchema,
  async handler({ tx, actor }, request): Promise<void> {
    await tx
      .update(notifications)
      .set({ readAt: sql`now()` })
      .where(
        and(
          eq(notifications.userId, actor.id),
          isNull(notifications.readAt),
          'ids' in request ? inArray(notifications.id, request.ids) : undefined,
        ),
      );
  },
});
