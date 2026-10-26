import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InvitationLink, MembersQuery, MembersResponse } from '@toppo/shared';
import { Alert, Dialog, DialogContent } from '@toppo/ui';
import { useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { Invitations } from '../../api/invitations.api.ts';
import { Users } from '../../api/users.api.ts';
import { applyUserChange, type UserChange } from '../../models/user-change.model.ts';
import { UsersQueries } from '../../queries/users.queries.ts';
import { InvitationLinks, linksDescription } from '../invitations/invitation-links.tsx';
import { InvitationRow } from './invitation-row.tsx';
import { MemberFilters } from './member-filters.tsx';
import { MemberRow } from './member-row.tsx';

const KNOWN_ERRORS = {
  LAST_ADMINISTRATOR: 'members.lastAdministrator',
  CANNOT_DEACTIVATE_SELF: 'members.cannotDeactivateSelf',
  CANNOT_DELETE_SELF: 'members.cannotDeleteSelf',
  CANNOT_CHANGE_OWN_ROLE: 'members.cannotChangeOwnRole',
  SYSTEM_ROLE_RESERVED: 'members.systemRoleReserved',
  USER_NOT_FOUND: 'members.userNotFound',
  INVALID_ROLE: 'members.invalidRole',
  INVITATION_NOT_FOUND: 'invitations.notFound',
  INVITATION_BEYOND_REACH: 'invitations.beyondReach',
  ALL_PROJECTS_RESERVED: 'members.allProjectsReserved',
} as const;

function send(change: UserChange): Promise<void> {
  switch (change.type) {
    case 'changeRole':
      return Users.changeRole(change.userId, change.roleId);
    case 'deactivate':
      return Users.deactivate(change.userId);
    case 'reactivate':
      return Users.reactivate(change.userId);
    case 'delete':
      return Users.delete(change.userId);
  }
}

/**
 * One page of members and pending invitations, as the server searched, filtered and sorted it.
 * Reports filter changes, for the caller to keep in the URL. A change shows at once and is
 * rolled back, with the reason, if the server refuses it; accepted changes to members are
 * reported, e.g. to refresh one's own session.
 */
export function MembersTable({
  query,
  onQueryChange,
  currentUserId,
  onUserChanged,
}: {
  query: MembersQuery;
  onQueryChange: (query: MembersQuery) => void;
  currentUserId: string;
  onUserChanged?: (userId: string) => void;
}) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const members = useQuery(UsersQueries.members(query));
  const roles = useQuery(UsersQueries.assignableRoles);
  const [failure, setFailure] = useState<unknown>(null);
  const [renewed, setRenewed] = useState<InvitationLink | null>(null);

  /** Applies `update` to every cached page at once, and returns them to roll back. */
  async function updatePages(update: (rows: MembersResponse['rows']) => MembersResponse['rows']) {
    await queryClient.cancelQueries({ queryKey: UsersQueries.allMembers });
    const previous = queryClient.getQueriesData<MembersResponse>({
      queryKey: UsersQueries.allMembers,
    });
    queryClient.setQueriesData<MembersResponse>({ queryKey: UsersQueries.allMembers }, (page) =>
      page ? { ...page, rows: update(page.rows) } : page,
    );
    return previous;
  }

  function rollBack(previous: ReturnType<typeof queryClient.getQueriesData> | undefined) {
    for (const [key, data] of previous ?? []) {
      queryClient.setQueryData(key, data);
    }
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: UsersQueries.allMembers });

  const changeMember = useMutation({
    mutationFn: send,
    onMutate: async (pending) => {
      setFailure(null);
      return await updatePages((rows) =>
        applyUserChange(rows, pending, roles.data ?? [], new Date()),
      );
    },
    onError: (error, _change, previous) => {
      setFailure(error);
      rollBack(previous);
    },
    onSuccess: (_data, accepted) => onUserChanged?.(accepted.userId),
    onSettled: refresh,
  });

  const renew = useMutation({
    mutationFn: (invitationId: string) => Invitations.renew(invitationId),
    onMutate: () => setFailure(null),
    onError: setFailure,
    onSuccess: setRenewed,
    onSettled: refresh,
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) => Invitations.revoke(invitationId),
    onMutate: async (invitationId) => {
      setFailure(null);
      return await updatePages((rows) => rows.filter((row) => row.id !== invitationId));
    },
    onError: (error, _invitationId, previous) => {
      setFailure(error);
      rollBack(previous);
    },
    onSettled: refresh,
  });

  if (members.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('members.loading')}
      </p>
    );
  }
  if (members.isError) {
    return <Alert tone="danger">{requestErrorMessage(members.error, t)}</Alert>;
  }

  const { rows, byRole, matching, page, pageSize } = members.data;
  const now = new Date();
  return (
    <div className="flex flex-col gap-4">
      {failure ? (
        <Alert tone="danger">{requestErrorMessage(failure, t, KNOWN_ERRORS)}</Alert>
      ) : null}
      <section
        aria-busy={members.isPlaceholderData}
        className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
      >
        <MemberFilters
          roles={roles.data ?? []}
          byRole={byRole}
          query={query}
          onChange={onQueryChange}
        />
        {rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {t('members.noMatch')}
          </p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2.5 pr-2 pl-4 font-medium">
                  {t('members.member')}
                </th>
                <th scope="col" className="w-32 px-2 py-2.5 font-medium sm:w-44">
                  {t('members.role')}
                </th>
                <th scope="col" className="hidden w-32 px-2 py-2.5 font-medium md:table-cell">
                  {t('members.state')}
                </th>
                <th scope="col" className="w-12 py-2.5 pr-2">
                  <span className="sr-only">{t('members.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) =>
                row.type === 'member' ? (
                  <MemberRow
                    key={row.id}
                    member={row}
                    roles={roles.data ?? []}
                    isCurrentUser={row.id === currentUserId}
                    onChange={(next) => changeMember.mutate(next)}
                  />
                ) : (
                  <InvitationRow
                    key={row.id}
                    invitation={row}
                    now={now}
                    onRenew={(invitationId) => renew.mutate(invitationId)}
                    onRevoke={(invitationId) => revoke.mutate(invitationId)}
                  />
                ),
              )}
            </tbody>
          </table>
        )}
        <Pager
          page={page}
          pageSize={pageSize}
          matching={matching}
          shown={rows.length}
          label={(count) => t(`members.shown.${pluralForm(locale, count)}`, { count })}
          onPage={(next) => onQueryChange({ ...query, page: next })}
        />
      </section>
      <Dialog open={renewed !== null} onOpenChange={(open) => (open ? null : setRenewed(null))}>
        <DialogContent
          title={t('invitations.linksTitle')}
          description={t(linksDescription(renewed ? [renewed] : []))}
          closeLabel={t('invitations.close')}
        >
          {renewed ? (
            <InvitationLinks
              links={[renewed]}
              alreadyMembers={[]}
              onDone={() => setRenewed(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
