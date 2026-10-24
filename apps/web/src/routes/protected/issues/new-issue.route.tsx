import { useQuery } from '@tanstack/react-query';
import { createRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo/core';
import { z } from 'zod';
import { NewIssueForm } from '../../../features/issues/components/form/new-issue-form.tsx';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { issuesRoute } from './issues.route.tsx';

const newIssueSearchSchema = z.object({
  project: z.string().trim().max(10).optional().catch(undefined),
});

/** A new issue in a project, on a page of its own: its requester is whoever reports it. */
export const newIssueRoute = createRoute({
  getParentRoute: () => issuesRoute,
  path: 'new',
  staticData: { titleKey: 'issues.newIssue' },
  validateSearch: newIssueSearchSchema,
  component: NewIssueScreen,
});

function NewIssueScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { project: projectKey } = newIssueRoute.useSearch();
  const project = useQuery({
    ...ProjectsQueries.detail(projectKey ?? ''),
    enabled: projectKey !== undefined,
  });

  if (!projectKey || project.isError) {
    return <Navigate to="/issues" replace />;
  }
  if (!project.data) {
    return null;
  }
  if (!can(project.data.permissions, 'issue.create')) {
    return (
      <Page title={t('issues.newIssue')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page
      title={t('issues.newIssue')}
      description={t('issues.newIssueDescription', { project: project.data.name })}
    >
      <NewIssueForm
        projectKey={projectKey}
        canAssign={can(project.data.permissions, 'issue.assign')}
        onCreated={(issueKey) => navigate({ to: '/issues/$issueKey', params: { issueKey } })}
        onCancel={() => navigate({ to: '/issues', search: { project: projectKey } })}
      />
    </Page>
  );
}
