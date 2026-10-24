import { z } from 'zod';
import { userRefSchema } from './members/users.ts';

/** Why someone is told: given the issue, named in a comment, or involved in the issue. */
export const NOTIFICATION_REASONS = ['assigned', 'mentioned', 'participating', 'newIssue'] as const;

export type NotificationReason = (typeof NOTIFICATION_REASONS)[number];

/** What a notification tells, as the bell shows it. */
export const NOTIFICATION_EVENTS = [
  'created',
  'assigned',
  'commented',
  'mentioned',
  'statusChanged',
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/** Notifications per page, the bell showing the first. */
export const NOTIFICATIONS_PAGE_SIZE = 20;

export const notificationSchema = z.object({
  id: z.uuid(),
  event: z.enum(NOTIFICATION_EVENTS),
  /** For a status change, the status the issue went to; `null` otherwise. */
  status: z.string().nullable(),
  actor: userRefSchema,
  issue: z.object({ key: z.string(), title: z.string() }),
  /** UTC ISO 8601, or `null` while unread. */
  readAt: z.iso.datetime().nullable(),
  /** UTC ISO 8601. */
  createdAt: z.iso.datetime(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const notificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

/** Body of `GET /api/v1/notifications`: one page, the latest first. */
export const notificationsResponseSchema = z.object({
  rows: z.array(notificationSchema).max(NOTIFICATIONS_PAGE_SIZE),
  matching: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;

/** Body of `GET /api/v1/notifications/unread-count`. */
export const unreadNotificationsResponseSchema = z.object({ count: z.number().int() });

/** Body of `POST /api/v1/notifications/read`: some notifications, or all of them. */
export const readNotificationsRequestSchema = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(NOTIFICATIONS_PAGE_SIZE) }),
  z.object({ all: z.literal(true) }),
]);

export type ReadNotificationsRequest = z.infer<typeof readNotificationsRequestSchema>;
