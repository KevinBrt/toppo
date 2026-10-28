import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import type { ProjectAccessQuery } from '@toppo-tracker/shared';
import { Alert } from '@toppo-tracker/ui';
import { useCallback } from 'react';
import { z } from 'zod';
import { AddMembersDialog } from '../../../features/projects/components/access/add-members-dialog.tsx';
import { ProjectAccessList } from '../../../features/projects/components/access/project-access-list.tsx';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectRoute } from './project.route.tsx';

/** The filters live in the URL: shareable, and kept by back and forward. Bad values are dropped. */
const accessSearchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

/** Who has access to a project: automatically, as a member, or once invited. */
export const projectAccessRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'access',
  validateSearch: accessSearchSchema,
  component: ProjectAccessScreen,
});

function ProjectAccessScreen() {
  const { t } = useI18n();
  const navigate = useNavigate({ from: projectAccessRoute.fullPath });
  const { projectKey } = projectAccessRoute.useParams();
  const { q, page } = projectAccessRoute.useSearch();
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));

  const changeQuery = useCallback(
    (next: ProjectAccessQuery) =>
      navigate({ search: { q: next.search || undefined, page: next.page }, replace: true }),
    [navigate],
  );

  if (!project) {
    return null;
  }
  if (!can(project.permissions, 'project.members.manage')) {
    return (
      <Page title={t('projectAccess.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page
      title={t('projectAccess.title')}
      description={t('projectAccess.description')}
      actions={project.archived ? null : <AddMembersDialog projectKey={projectKey} />}
    >
      <div className="flex flex-col gap-4">
        {project.archived ? <Alert>{t('projects.archivedNotice')}</Alert> : null}
        <ProjectAccessList
          projectKey={projectKey}
          readOnly={project.archived}
          query={{ search: q, page }}
          onQueryChange={changeQuery}
        />
      </div>
    </Page>
  );
}
