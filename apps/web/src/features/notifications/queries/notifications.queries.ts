import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { Notifications } from '../api/notifications.api.ts';

/** How often the bell asks for news, besides when the tab comes back. */
const UNREAD_REFRESH_MS = 30_000;

/** Cached notifications. Keys start with `notifications`. */
export const NotificationsQueries = {
  all: ['notifications'] as const,
  unread: queryOptions({
    queryKey: ['notifications', 'unread'],
    queryFn: () => Notifications.unread(),
    refetchInterval: UNREAD_REFRESH_MS,
  }),
  list: (page: number) =>
    queryOptions({
      queryKey: ['notifications', 'list', page],
      queryFn: () => Notifications.list(page),
      placeholderData: keepPreviousData,
    }),
};
