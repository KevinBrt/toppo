import { queryOptions } from '@tanstack/react-query';
import { Webhooks } from '../api/webhooks.api.ts';

/** A delivery is tried within seconds of being queued: often enough to see it, no more. */
const FIRST_TRY_POLL_MS = 3000;

/** Cached webhooks data. Keys start with `webhooks`. */
export const WebhooksQueries = {
  /** Everything about webhooks, to refresh it all after a change. */
  all: ['webhooks'] as const,
  /** At most 20 webhooks: loaded whole. */
  list: queryOptions({
    queryKey: ['webhooks', 'list'],
    queryFn: () => Webhooks.list(),
  }),
  /** Read again every few seconds while a delivery waits for its first try, to show how it went. */
  detail: (id: string) =>
    queryOptions({
      queryKey: ['webhooks', 'detail', id],
      queryFn: () => Webhooks.get(id),
      refetchInterval: (query) =>
        query.state.data?.deliveries.some(
          ({ status, attempts }) => status === 'pending' && attempts === 0,
        )
          ? FIRST_TRY_POLL_MS
          : false,
    }),
};
