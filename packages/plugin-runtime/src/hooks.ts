import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScreenFailure } from '@toppo-tracker/plugin-sdk/protocol';
import type {
  ActionMutation,
  ActionQuery,
  ConfirmOptions,
  ScreenState,
} from '@toppo-tracker/plugin-ui';
import { useCallback } from 'react';
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

/** Has the person confirm, in a dialog of Toppo's that names the plugin. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const { bridge } = useScreenSession();
  return useCallback((options) => bridge.confirm(options), [bridge]);
}

/** Opens one of the plugin's dialogs: what it closed with, `null` when dismissed. */
export function useOpenDialog(): (name: string, input: unknown) => Promise<unknown> {
  const { bridge } = useScreenSession();
  return useCallback((name, input) => bridge.dialog(name, input), [bridge]);
}

/** In a dialog, what the screen that opened it handed it; `null` in any other screen. */
export function useDialogInput(): unknown {
  return useScreenSession().context.input;
}

/** In a dialog, closes it: the screen that opened it is answered `result`. */
export function useCloseDialog(): (result?: unknown) => void {
  const { bridge } = useScreenSession();
  return useCallback((result) => bridge.close(result), [bridge]);
}

/** Toppo's search of issues, or of people: what the person picked, `null` for nothing. */
export function usePick(): (
  of: 'issue' | 'people',
  options: { projectId?: string; multiple?: boolean },
) => Promise<unknown> {
  const { bridge } = useScreenSession();
  return useCallback((of, options) => bridge.pick(of, options), [bridge]);
}
