import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import type { Locale, MembersQuery } from '@toppo-tracker/shared';
import { useCallback } from 'react';
import { z } from 'zod';
import { ProjectPicker } from '../../../features/projects/components/picker/project-picker.tsx';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { InviteMembers } from '../../../features/users/components/invitations/invite-members.tsx';
import { MembersTable } from '../../../features/users/components/members/members-table.tsx';
import { UsersQueries } from '../../../features/users/queries/users.queries.ts';
import type { Translate } from '../../../shared/i18n/i18n.types.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../shared/i18n/plural.util.ts';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { settingsRoute } from './settings.route.tsx';

/** The filters live in the URL: shareable, and kept by back and forward. Bad values are dropped. */
const membersSearchSchema = z.object({
  role: z.uuid().optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const membersRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: 'members',
  staticData: { titleKey: 'members.title' },
  validateSearch: membersSearchSchema,
  component: MembersScreen,
});

function MembersScreen() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: membersRoute.fullPath });
  const { role, q, page } = membersRoute.useSearch();
  const query: MembersQuery = { role, search: q, page };
  const { data: user } = useQuery(SessionQueries.currentUser);
  const allowed = Boolean(user && can(user.permissions, 'instance.users.manage'));
  const members = useQuery({ ...UsersQueries.members(query), enabled: allowed });

  const changeQuery = useCallback(
    (next: MembersQuery) =>
      navigate({
        search: { role: next.role, q: next.search || undefined, page: next.page },
        replace: true,
      }),
    [navigate],
  );

  if (!(user && allowed)) {
    return (
      <Page title={t('members.title')}>
        <AccessDenied />
      </Page>
    );
  }
  const totals = members.data?.totals;
  return (
    <Page
      title={t('members.title')}
      description={totals ? headCount(t, locale, totals.members, totals.invitations) : undefined}
      actions={<InviteMembers projectPicker={(picker) => <ProjectPicker {...picker} />} />}
    >
      <MembersTable
        query={query}
        onQueryChange={changeQuery}
        currentUserId={user.id}
        onUserChanged={async (userId) => {
          // One's own role may have changed what the app should show.
          if (userId === user.id) {
            await queryClient.invalidateQueries({ queryKey: SessionQueries.currentUser.queryKey });
          }
        }}
      />
    </Page>
  );
}

/** "11 members, including 2 pending invitations", the way the mockup counts. */
function headCount(t: Translate, locale: Locale, members: number, invitations: number): string {
  const total = members + invitations;
  const everyone = t(`members.count.${pluralForm(locale, total)}`, { count: total });
  if (invitations === 0) {
    return everyone;
  }
  const pending = t(`members.pending.${pluralForm(locale, invitations)}`, { count: invitations });
  return t('members.countWithPending', { members: everyone, pending });
}
