import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScreenFailure } from '@toppo-tracker/plugin-sdk/protocol';
import type { ActionMutation, ActionQuery, ScreenState } from '@toppo-tracker/plugin-ui';
import { useScreenSession } from './screen-context.ts';

/** A failure as screens read it: what Toppo answered, or that the call went wrong. */
function failureOf(error: unknown): ScreenFailure | null {
  if (error === null || error === undefined) {
    return null;
  }
  return typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? (error as ScreenFailure)
    : { code: 'INTERNAL_ERROR' };
}

export function useActionQuery(
  name: string,
  input: unknown,
  enabled: boolean,
): ActionQuery<unknown> {
  const { bridge } = useScreenSession();
  const query = useQuery({
    queryKey: ['action', name, input],
    queryFn: () => bridge.action(name, input),
    enabled,
  });
  return {
    data: query.data,
    error: failureOf(query.error),
    isLoading: query.isLoading,
    refetch: () => {
      void query.refetch();
    },
  };
}

export function useActionMutation(name: string): ActionMutation<unknown, unknown> {
  const { bridge } = useScreenSession();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: unknown) => bridge.action(name, input, true),
    // What the screen shows may have changed: every action it shows is asked again.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action'] }),
  });
  return {
    run: (input) => mutation.mutateAsync(input),
    isPending: mutation.isPending,
    error: failureOf(mutation.error),
  };
}

export function useScreen(): ScreenState {
  const { context, bridge } = useScreenSession();
  return {
    locale: context.locale,
    user: context.user,
    issue: context.issue,
    project: context.project,
    search: context.search,
    setSearch: (search) => bridge.post({ kind: 'search', search }),
    open: (target) => bridge.post({ kind: 'open', target }),
  };
}

export function usePeople(ids: readonly string[]): ReadonlyMap<string, string | null> {
  const { bridge } = useScreenSession();
  const wanted = [...new Set(ids)].sort();
  const { data } = useQuery({
    queryKey: ['people', wanted],
    queryFn: () => bridge.people(wanted),
    enabled: wanted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
  return new Map((data ?? []).map(({ id, name }) => [id, name]));
}
