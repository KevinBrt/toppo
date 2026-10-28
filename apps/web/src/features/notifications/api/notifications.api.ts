import {
  type NotificationsResponse,
  notificationsResponseSchema,
  type ReadNotificationsRequest,
  unreadNotificationsResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the signed-in person's notifications. */
export const Notifications = {
  /** One page, the latest first. */
  async list(page: number): Promise<NotificationsResponse> {
    const query = page > 1 ? `?${new URLSearchParams({ page: String(page) })}` : '';
    return await apiRequest(`/api/v1/notifications${query}`, {
      schema: notificationsResponseSchema,
    });
  },

  /** How many are unread. */
  async unread(): Promise<number> {
    return (
      await apiRequest('/api/v1/notifications/unread-count', {
        schema: unreadNotificationsResponseSchema,
      })
    ).count;
  },

  /** Marks some read, or all of them. */
  async read(request: ReadNotificationsRequest): Promise<void> {
    await apiRequest('/api/v1/notifications/read', {
      method: 'POST',
      body: request,
      schema: z.null(),
    });
  },
};
