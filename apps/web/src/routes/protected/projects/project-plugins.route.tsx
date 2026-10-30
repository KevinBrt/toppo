import { useQuery } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { ProjectPluginSettings } from '../../../features/plugins/components/settings/project-plugin-settings.tsx';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectRoute } from './project.route.tsx';

/** What the plugins at work in a project take of it: a budget, an address… */
export const projectPluginsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: 'plugins',
  component: ProjectPluginsScreen,
});

function ProjectPluginsScreen() {
  const { t } = useI18n();
  const { projectKey } = projectPluginsRoute.useParams();
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));

  if (!project) {
    return null;
  }
  if (!can(project.permissions, 'project.settings.manage')) {
    return (
      <Page title={t('projectPlugins.title')}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <Page title={t('projectPlugins.title')} description={t('projectPlugins.description')}>
      <ProjectPluginSettings projectKey={projectKey} />
    </Page>
  );
}
