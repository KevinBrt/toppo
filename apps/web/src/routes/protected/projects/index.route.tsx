import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import type { ProjectsQuery } from '@toppo-tracker/shared';
import { useCallback } from 'react';
import { z } from 'zod';
import { NewProject } from '../../../features/projects/components/list/new-project.tsx';
import { ProjectsList } from '../../../features/projects/components/list/projects-list.tsx';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectsRoute } from './projects.route.tsx';

/** The filters live in the URL: shareable, and kept by back and forward. Bad values are dropped. */
const projectsSearchSchema = z.object({
  state: z.enum(['active', 'archived']).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
});

export const projectsIndexRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '/',
  validateSearch: projectsSearchSchema,
  component: ProjectsScreen,
});

function ProjectsScreen() {
  const { t } = useI18n();
  const navigate = useNavigate({ from: projectsIndexRoute.fullPath });
  const { state, q, page } = projectsIndexRoute.useSearch();
  // The projects screen is where projects are managed: those the user manages, nothing more.
  const query: ProjectsQuery = { scope: 'managed', state, search: q, page };
  const { data: user } = useQuery(SessionQueries.currentUser);

  const changeQuery = useCallback(
    (next: ProjectsQuery) =>
      navigate({
        search: {
          state: next.state === 'archived' ? 'archived' : undefined,
          q: next.search || undefined,
          page: next.page,
        },
        replace: true,
      }),
    [navigate],
  );

  return (
    <Page
      title={t('nav.projects')}
      description={t('projects.intro')}
      actions={
        user && can(user.permissions, 'project.create') ? (
          <NewProject
            onCreated={(key) =>
              navigate({ to: '/projects/$projectKey', params: { projectKey: key } })
            }
          />
        ) : null
      }
    >
      <ProjectsList query={query} onQueryChange={changeQuery} />
    </Page>
  );
}
