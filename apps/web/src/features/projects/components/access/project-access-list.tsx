import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isInvitationExpired } from '@toppo-tracker/core';
import type {
  ProjectAccessQuery,
  ProjectAccessResponse,
  ProjectAccessRow,
  RoleBadge,
} from '@toppo-tracker/shared';
import { Alert, Avatar, Badge, BadgeSelect, Button, Input } from '@toppo-tracker/ui';
import { SearchIcon } from 'lucide-react';
import { type ReactNode, useEffect, useId, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { ProjectAccess } from '../../api/project-access.api.ts';
import { ProjectsQueries } from '../../queries/projects.queries.ts';

const KNOWN_ERRORS = {
  ROLE_BEYOND_YOURS: 'projectAccess.roleBeyondYours',
  MEMBER_NOT_FOUND: 'projectAccess.memberNotFound',
  INVALID_ROLE: 'projectAccess.invalidRole',
  INVITATION_NOT_FOUND: 'projectAccess.invitationNotFound',
  SYSTEM_ROLE_HOLDER: 'projectAccess.systemRoleHolder',
} as const;

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/** The value of the "own role" option: the role the member has everywhere else. Never a role id. */
const OWN_ROLE = 'own';

type Change =
  | { type: 'changeRole'; userId: string; roleId: string | null }
  | { type: 'removeMember'; userId: string }
  | { type: 'removeInvitation'; invitationId: string };

type Person = Extract<ProjectAccessRow, { kind: 'person' }>;
type Invitation = Extract<ProjectAccessRow, { kind: 'invitation' }>;

/**
 * One page of everyone who has access to the project, as the server searched them: those who
 * reach it automatically, its members with their role there, changed in place, and the pending
 * invitations. Changes show at once and roll back, with the reason, when the server refuses them.
 */
export function ProjectAccessList({
  projectKey,
  readOnly = false,
  query,
  onQueryChange,
}: {
  projectKey: string;
  /** An archived project: who has access is shown, not changed. */
  readOnly?: boolean;
  query: ProjectAccessQuery;
  onQueryChange: (query: ProjectAccessQuery) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const headingId = useId();
  const access = useQuery(ProjectsQueries.access(projectKey, query));
  const roles = useQuery(ProjectsQueries.roles(projectKey));
  const [failure, setFailure] = useState<unknown>(null);
  const search = query.search ?? '';
  const [typed, setTyped] = useState(search);
  const pages = ProjectsQueries.allAccess(projectKey);

  useEffect(() => setTyped(search), [search]);
  useEffect(() => {
    if (typed.trim() === search) {
      return;
    }
    const timer = setTimeout(
      () => onQueryChange({ search: typed.trim() || undefined }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [typed, search, onQueryChange]);

  const change = useMutation({
    mutationFn: (pending: Change) => {
      switch (pending.type) {
        case 'changeRole':
          return ProjectAccess.changeRole(projectKey, pending.userId, pending.roleId);
        case 'removeMember':
          return ProjectAccess.remove(projectKey, pending.userId);
        case 'removeInvitation':
          return ProjectAccess.removeInvitation(projectKey, pending.invitationId);
      }
    },
    onMutate: async (pending) => {
      setFailure(null);
      await queryClient.cancelQueries({ queryKey: pages });
      const previous = queryClient.getQueriesData<ProjectAccessResponse>({ queryKey: pages });
      queryClient.setQueriesData<ProjectAccessResponse>({ queryKey: pages }, (page) =>
        page ? applyChange(page, pending, roles.data ?? []) : page,
      );
      return previous;
    },
    onError: (error, _change, previous) => {
      setFailure(error);
      for (const [key, data] of previous ?? []) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ProjectsQueries.all }),
  });

  if (access.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('projectAccess.loading')}
      </p>
    );
  }
  if (access.isError) {
    return <Alert tone="danger">{requestErrorMessage(access.error, t)}</Alert>;
  }

  const { rows, matching, page, pageSize } = access.data;
  const givable = roles.data ?? [];
  return (
    <div className="flex flex-col gap-4">
      {failure ? (
        <Alert tone="danger">{requestErrorMessage(failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      <section
        aria-labelledby={headingId}
        aria-busy={access.isPlaceholderData}
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
      >
        <div className="flex flex-col gap-1 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
          <h2 id={headingId} className="text-sm font-semibold text-foreground">
            {t('projectAccess.heading')}{' '}
            <span className="font-normal text-muted-foreground">{matching}</span>
          </h2>
          <p className="text-xs text-muted-foreground">{t('projectAccess.automaticNote')}</p>
        </div>
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <div className="relative sm:w-64">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              type="search"
              aria-label={t('projectAccess.search')}
              placeholder={t('projectAccess.search')}
              value={typed}
              maxLength={100}
              onChange={(event) => setTyped(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t('projectAccess.noMatch')}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) =>
              row.kind === 'person' ? (
                <PersonRow
                  key={row.userId}
                  person={row}
                  givable={readOnly ? null : givable}
                  onChange={(next) => change.mutate(next)}
                />
              ) : (
                <InvitationRow
                  key={row.invitationId}
                  invitation={row}
                  onRemove={
                    readOnly
                      ? null
                      : () =>
                          change.mutate({
                            type: 'removeInvitation',
                            invitationId: row.invitationId,
                          })
                  }
                />
              ),
            )}
          </ul>
        )}
        <Pager
          page={page}
          pageSize={pageSize}
          matching={matching}
          shown={rows.length}
          label={(count) => t(`projectAccess.shown.${pluralForm(locale, count)}`, { count })}
          onPage={(next) => onQueryChange({ ...query, page: next })}
        />
      </section>
    </div>
  );
}

/** Who, their role, and what can be done: the same three parts on every row. */
function AccessRow({
  who,
  title,
  detail,
  role,
  action,
}: {
  /** The name or address the initials are taken from. */
  who: string;
  title: ReactNode;
  detail: string;
  role: ReactNode;
  action: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-56 items-center gap-3">
        <Avatar name={who} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{title}</p>
          <p className="truncate text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 sm:w-48">{role}</div>
        <div className="flex sm:w-36 sm:justify-end">{action}</div>
      </div>
    </li>
  );
}

function PersonRow({
  person,
  givable,
  onChange,
}: {
  person: Person;
  /** The roles the caller may give; `null` when nothing may change. */
  givable: readonly RoleBadge[] | null;
  onChange: (change: Change) => void;
}) {
  const { t } = useI18n();
  const current = person.projectRole ?? person.ownRole;
  const automatic = person.access !== 'member';
  // A role the caller may not give stays as it is: the server would refuse any change.
  const changeable =
    givable !== null &&
    !automatic &&
    (person.projectRole === null || givable.some(({ id }) => id === current.id));
  const options = [
    {
      value: OWN_ROLE,
      label: t('projectAccess.ownRole', { role: person.ownRole.name }),
      tone: person.ownRole.color,
    },
    ...(givable ?? []).map((role) => ({ value: role.id, label: role.name, tone: role.color })),
  ];
  const remove = () => onChange({ type: 'removeMember', userId: person.userId });

  return (
    <AccessRow
      who={person.name}
      title={
        <>
          {person.name}
          {person.deactivatedAt ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {t('projectAccess.deactivated')}
            </span>
          ) : null}
        </>
      }
      detail={person.email}
      role={
        changeable ? (
          <BadgeSelect
            aria-label={t('projectAccess.roleOf', { name: person.name })}
            options={options}
            value={person.projectRole?.id ?? OWN_ROLE}
            onValueChange={(value) =>
              onChange({
                type: 'changeRole',
                userId: person.userId,
                roleId: value === OWN_ROLE ? null : value,
              })
            }
            className="max-w-full"
          />
        ) : (
          <Badge tone={current.color}>{current.name}</Badge>
        )
      }
      action={
        automatic ? (
          <span className="text-sm text-muted-foreground">{t('projectAccess.automatic')}</span>
        ) : (
          <RemoveButton name={person.name} onRemove={givable === null ? null : remove} />
        )
      }
    />
  );
}

function InvitationRow({
  invitation,
  onRemove,
}: {
  invitation: Invitation;
  /** `null` when nothing may change. */
  onRemove: (() => void) | null;
}) {
  const { t } = useI18n();
  const expired = isInvitationExpired(new Date(invitation.expiresAt), new Date());

  return (
    <AccessRow
      who={invitation.email}
      title={invitation.email}
      detail={expired ? t('projectAccess.invitationExpired') : t('projectAccess.invitationSent')}
      role={<Badge tone={invitation.role.color}>{invitation.role.name}</Badge>}
      action={
        invitation.allProjects ? (
          <span className="text-sm text-muted-foreground">{t('projectAccess.automatic')}</span>
        ) : (
          <RemoveButton name={invitation.email} onRemove={onRemove} />
        )
      }
    />
  );
}

/** "Remove", named after whom it removes; nothing while the list may not change. */
function RemoveButton({ name, onRemove }: { name: string; onRemove: (() => void) | null }) {
  const { t } = useI18n();

  if (!onRemove) {
    return null;
  }
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-label={t('projectAccess.removeFrom', { name })}
      onClick={onRemove}
    >
      {t('projectAccess.remove')}
    </Button>
  );
}

/** A change, applied to the page shown before the server confirms it. */
function applyChange(
  page: ProjectAccessResponse,
  change: Change,
  roles: readonly RoleBadge[],
): ProjectAccessResponse {
  const without = (keep: (row: ProjectAccessRow) => boolean) => {
    const rows = page.rows.filter(keep);
    return { ...page, rows, matching: page.matching - (page.rows.length - rows.length) };
  };
  switch (change.type) {
    case 'removeMember':
      return without((row) => row.kind !== 'person' || row.userId !== change.userId);
    case 'removeInvitation':
      return without(
        (row) => row.kind !== 'invitation' || row.invitationId !== change.invitationId,
      );
    case 'changeRole': {
      const role = roles.find(({ id }) => id === change.roleId) ?? null;
      return {
        ...page,
        rows: page.rows.map((row) =>
          row.kind === 'person' && row.userId === change.userId
            ? { ...row, projectRole: role }
            : row,
        ),
      };
    }
  }
}
