import { useQuery } from '@tanstack/react-query';
import { createRoute, Navigate, useNavigate } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { GeneralSettings } from '../../../features/projects/components/settings/general-settings.tsx';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { Page } from '../../../shared/layout/page.tsx';
import { projectRoute } from './project.route.tsx';

/** What a project is: its name, key, color and description; who only manages access lands there. */
export const projectGeneralRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  component: ProjectGeneralScreen,
});

function ProjectGeneralScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { projectKey } = projectGeneralRoute.useParams();
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));
  const { data: user } = useQuery(SessionQueries.currentUser);

  if (!project) {
    return null;
  }
  if (!can(project.permissions, 'project.settings.manage')) {
    return <Navigate to="/projects/$projectKey/access" params={{ projectKey }} replace />;
  }
  return (
    <Page title={t('projectSettings.title')} description={t('projectSettings.description')}>
      <GeneralSettings
        project={project}
        canDelete={Boolean(user && can(user.permissions, 'project.delete'))}
        onKeyChanged={(key) =>
          navigate({ to: '/projects/$projectKey', params: { projectKey: key }, replace: true })
        }
        onDeleted={() => navigate({ to: '/projects' })}
      />
    </Page>
  );
}
