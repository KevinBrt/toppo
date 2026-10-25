import { queryOptions } from '@tanstack/react-query';
import { Instance } from '../api/instance.api.ts';

/** The server checks once a day: asking again within the hour would learn nothing. */
const VERSION_STALE_MS = 60 * 60 * 1000;

/** Cached knowledge of the versions. Keys start with `updates`. */
export const UpdatesQueries = {
  version: queryOptions({
    queryKey: ['updates', 'version'],
    queryFn: () => Instance.version(),
    staleTime: VERSION_STALE_MS,
  }),
};
