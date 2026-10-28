import { createRoute, useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@toppo-tracker/ui';
import { UserIcon } from 'lucide-react';
import { z } from 'zod';
import { AssignedIssuesList } from '../../../features/issues/components/list/assigned-issues-list.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { protectedRoute } from '../protected.route.tsx';

/** The page lives in the URL: kept by back and forward. */
const myIssuesSearchSchema = z.object({
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

/** The issues assigned to the signed-in person, in every project. */
export const myIssuesRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/my-issues',
  validateSearch: myIssuesSearchSchema,
  staticData: { titleKey: 'nav.myIssues' },
  component: MyIssuesScreen,
});

function MyIssuesScreen() {
  const { t } = useI18n();
  const navigate = useNavigate({ from: myIssuesRoute.fullPath });
  const { page } = myIssuesRoute.useSearch();

  return (
    <Page title={t('nav.myIssues')}>
      <AssignedIssuesList
        query={{ page }}
        empty={
          <EmptyState
            icon={UserIcon}
            title={t('myIssues.emptyTitle')}
            description={t('myIssues.emptyDescription')}
          />
        }
        onQueryChange={(next) => navigate({ search: { page: next.page } })}
      />
    </Page>
  );
}
