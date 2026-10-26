import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserProjectsResponse, UserSummary } from '@toppo/shared';
import { Alert, Button, Dialog, DialogClose, DialogContent, Input, Switch } from '@toppo/ui';
import { useEffect, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { Users } from '../../api/users.api.ts';
import { UsersQueries } from '../../queries/users.queries.ts';

const KNOWN_ERRORS = {
  PROJECT_NOT_FOUND: 'projects.notFound',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
  ALL_PROJECTS_RESERVED: 'members.allProjectsReserved',
  SYSTEM_ROLE_RESERVED: 'members.systemRoleReserved',
  USER_NOT_FOUND: 'members.userNotFound',
} as const;

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

type Change =
  | { type: 'all'; allProjects: boolean }
  | { type: 'project'; key: string; member: boolean };

/**
 * A member's access to projects: every project, or those switched on below. Each switch saves
 * at once, and goes back, with the reason, if the server refuses it.
 */
export function MemberProjectsDialog({
  member,
  open,
  onOpenChange,
  onClosed,
}: {
  member: UserSummary;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Where focus goes back once the dialog is closed, e.g. the menu that opened it. */
  onClosed: () => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const allProjectsId = useId();
  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  const access = useQuery({ ...UsersQueries.projects(member.id, search), enabled: open });
  const searches = UsersQueries.allProjectsOf(member.id);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const change = useMutation({
    mutationFn: (pending: Change) => {
      if (pending.type === 'all') {
        return Users.setAllProjects(member.id, pending.allProjects);
      }
      return pending.member
        ? Users.joinProject(member.id, pending.key)
        : Users.leaveProject(member.id, pending.key);
    },
    onMutate: async (pending) => {
      await queryClient.cancelQueries({ queryKey: searches });
      const previous = queryClient.getQueriesData<UserProjectsResponse>({ queryKey: searches });
      queryClient.setQueriesData<UserProjectsResponse>({ queryKey: searches }, (shown) =>
        shown ? applyChange(shown, pending) : shown,
      );
      return previous;
    },
    onError: (_error, _change, previous) => {
      for (const [key, data] of previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: searches }),
  });

  const allProjects = access.data?.allProjects ?? false;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setTyped('');
          change.reset();
        }
      }}
    >
      <DialogContent
        title={t('memberProjects.title', { name: member.name })}
        closeLabel={t('memberProjects.close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <div className="flex flex-col gap-4">
          {change.isError ? (
            <Alert tone="danger">{requestErrorMessage(change.error, t, KNOWN_ERRORS)}</Alert>
          ) : null}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p id={allProjectsId} className="text-sm font-medium text-foreground">
                {t('memberProjects.allProjects')}
              </p>
              <p className="text-xs text-muted-foreground">{t('memberProjects.allProjectsHelp')}</p>
            </div>
            <Switch
              aria-labelledby={allProjectsId}
              checked={allProjects}
              disabled={!access.data}
              onCheckedChange={(next) => change.mutate({ type: 'all', allProjects: next })}
            />
          </div>
          <Input
            type="search"
            aria-label={t('memberProjects.search')}
            placeholder={t('memberProjects.search')}
            value={typed}
            maxLength={100}
            onChange={(event) => setTyped(event.target.value)}
          />
          {access.isPending ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t('memberProjects.loading')}
            </p>
          ) : (
            <ul
              aria-busy={access.isFetching}
              className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
            >
              {(access.data?.rows ?? []).map((project) => (
                <li
                  key={project.key}
                  className="flex items-center justify-between gap-3 px-3 py-1.5"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {project.key}
                    </span>
                    <span className="truncate text-sm text-foreground">{project.name}</span>
                  </span>
                  <Switch
                    aria-label={t('memberProjects.accessTo', { project: project.name })}
                    checked={allProjects || project.member}
                    disabled={allProjects}
                    onCheckedChange={(next) =>
                      change.mutate({ type: 'project', key: project.key, member: next })
                    }
                  />
                </li>
              ))}
              {access.data?.rows.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                  {t('memberProjects.noProject')}
                </li>
              ) : null}
            </ul>
          )}
          <DialogClose asChild>
            <Button variant="secondary" className="self-end">
              {t('memberProjects.done')}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A change, applied to what is shown before the server confirms it. */
function applyChange(shown: UserProjectsResponse, change: Change): UserProjectsResponse {
  if (change.type === 'all') {
    return { ...shown, allProjects: change.allProjects };
  }
  return {
    ...shown,
    rows: shown.rows.map((row) =>
      row.key === change.key ? { ...row, member: change.member } : row,
    ),
  };
}
