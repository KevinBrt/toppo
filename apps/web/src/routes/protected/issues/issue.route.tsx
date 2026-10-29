import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { EmptyState } from '@toppo-tracker/ui';
import { FileXIcon } from 'lucide-react';
import { useEffect } from 'react';
import { IssueView } from '../../../features/issues/components/issue/issue-view.tsx';
import { IssuesQueries } from '../../../features/issues/queries/issues.queries.ts';
import { rememberProject } from '../../../features/issues/utils/last-project.util.ts';
import { IssuePanels } from '../../../features/plugins/components/screens/issue-panels.tsx';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { ApiRequestError } from '../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page, useDocumentTitle } from '../../../shared/layout/page.tsx';
import { CRUMB_CURRENT_CLASS, type CrumbProps } from '../../../shared/layout/topbar.tsx';
import { usePluginNavigation } from '../plugins/plugin-page.route.tsx';
import { issuesRoute } from './issues.route.tsx';

/** The issue's key in the top bar: the very text people pass on. */
function IssueCrumb({ params }: CrumbProps) {
  return (
    <span aria-current="page" className={`shrink-0 font-mono ${CRUMB_CURRENT_CLASS}`}>
      {params['issueKey']}
    </span>
  );
}

/**
 * An issue's page, at its key: `/issues/WEB-42`. One the person may not see answers like one
 * that does not exist.
 */
export const issueRoute = createRoute({
  getParentRoute: () => issuesRoute,
  path: '$issueKey',
  staticData: { crumb: IssueCrumb },
  component: IssueScreen,
});

function IssueScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { issueKey } = issueRoute.useParams();
  const issue = useQuery(IssuesQueries.detail(issueKey));
  const { data: user } = useQuery(SessionQueries.currentUser);
  const queryClient = useQueryClient();
  const openFromPlugin = usePluginNavigation(issueKey.split('-')[0]);
  useDocumentTitle(issue.data ? `${issue.data.key} ${issue.data.title}` : issueKey);

  // Back on the list, it is this issue's project that shows.
  useEffect(() => {
    if (issue.data) {
      rememberProject(issue.data.project.key);
    }
  }, [issue.data]);

  if (issue.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('issues.issueLoading')}
      </p>
    );
  }
  if (issue.isError) {
    const missing = issue.error instanceof ApiRequestError && issue.error.status === 404;
    return (
      <Page title={missing ? t('notFound.title') : issueKey}>
        <EmptyState
          icon={FileXIcon}
          title={missing ? t('notFound.title') : t('errors.unexpected')}
          description={missing ? t('issues.notFound') : requestErrorMessage(issue.error, t)}
        />
      </Page>
    );
  }
  return (
    <IssueView
      issue={issue.data}
      // Comments answer whoever reported the issue, unless one reported it oneself.
      replyTo={issue.data.reporter.id === user?.id ? null : issue.data.reporter}
      panels={
        <IssuePanels
          issueKey={issue.data.key}
          user={user ?? undefined}
          onOpen={(target, pluginSlug) => openFromPlugin(pluginSlug, target)}
          onChanged={() =>
            queryClient.invalidateQueries({ queryKey: IssuesQueries.detail(issueKey).queryKey })
          }
        />
      }
      onDeleted={() =>
        navigate({ to: '/issues', search: { project: issue.data.project.key }, replace: true })
      }
    />
  );
}
