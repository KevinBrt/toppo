import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { can } from '@toppo/core';
import { IssuesQueries } from '../../../features/issues/queries/issues.queries.ts';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { ProjectPropertiesEditor } from '../../../features/properties/components/project/project-properties.tsx';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectRoute } from './project.route.tsx';

/**
 * How a project's issues take the organization's fields: the category and the priority, each
 * property of the organization, then the project's own properties.
 */
export const projectPropertiesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'properties',
  component: ProjectPropertiesScreen,
});

function ProjectPropertiesScreen() {
  const { t } = useI18n();
  const { projectKey } = projectPropertiesRoute.useParams();
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));
  const queryClient = useQueryClient();

  if (!project) {
    return null;
  }
  if (!can(project.permissions, 'project.settings.manage')) {
    return (
      <Page title={t('projectProperties.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page title={t('projectProperties.title')} description={t('projectProperties.description')}>
      <ProjectPropertiesEditor
        projectKey={projectKey}
        // The project's issues offer what it now takes.
        onChanged={() => queryClient.invalidateQueries({ queryKey: IssuesQueries.all })}
      />
    </Page>
  );
}
