import { queryOptions } from '@tanstack/react-query';
import { Plugins } from '../api/plugins.api.ts';

/** Cached plugins data. Keys start with `plugins`. */
export const PluginsQueries = {
  /** Everything about plugins, to refresh it all after a change. */
  all: ['plugins'] as const,
  /** At most 50 plugins: loaded whole. */
  list: queryOptions({
    queryKey: ['plugins', 'list'],
    queryFn: () => Plugins.list(),
  }),
  detail: (slug: string) =>
    queryOptions({
      queryKey: ['plugins', 'detail', slug],
      queryFn: () => Plugins.get(slug),
    }),
};
