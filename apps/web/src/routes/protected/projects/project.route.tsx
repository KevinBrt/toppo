import { useQuery } from '@tanstack/react-query';
import { createRoute, Link, Outlet } from '@tanstack/react-router';
import { can } from '@toppo-tracker/core';
import { EmptyState } from '@toppo-tracker/ui';
import { FolderXIcon } from 'lucide-react';
import { PluginsQueries } from '../../../features/plugins/queries/plugins.queries.ts';
import { pluginNavSections } from '../../../features/plugins/utils/plugin-nav.util.ts';
import { ProjectIdentity } from '../../../features/projects/components/settings/project-identity.tsx';
import {
  PROJECT_ADMIN_NAV,
  PROJECT_PLUGINS_PATH,
} from '../../../features/projects/constants/project-admin.constants.ts';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { ApiRequestError } from '../../../shared/api/http.client.ts';
import { requestErrorMessage } from '../../../shared/forms/form-errors.util.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { AccessDenied } from '../../../shared/layout/access-denied.tsx';
import type { NavSection } from '../../../shared/layout/navigation.constants.ts';
import { visibleSections } from '../../../shared/layout/navigation.util.ts';
import { Page } from '../../../shared/layout/page.tsx';
import { SectionLayout } from '../../../shared/layout/section-layout.tsx';
import {
  CRUMB_CURRENT_CLASS,
  CRUMB_LINK_CLASS,
  type CrumbProps,
} from '../../../shared/layout/topbar.tsx';
import { projectsRoute } from './projects.route.tsx';

/** The project's name in the top bar, its key until the name is known. */
function ProjectCrumb({ params, current }: CrumbProps) {
  const key = params['projectKey'] ?? '';
  const { data: project } = useQuery(ProjectsQueries.detail(key));
  const name = project?.name ?? key;
  return current ? (
    <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
      {name}
    </span>
  ) : (
    <Link to="/projects/$projectKey" params={{ projectKey: key }} className={CRUMB_LINK_CLASS}>
      {name}
    </Link>
  );
}

/**
 * A project's own pages, for those who manage it: its general settings, who has access to it.
 * A project out of reach answers like one that does not exist: the screen says so the same way,
 * never that it is forbidden.
 */
export const projectRoute = createRoute({
  getParentRoute: () => projectsRoute,
  path: '$projectKey',
  staticData: { crumb: ProjectCrumb },
  component: ProjectLayout,
});

/** The project's pages, its Plugins tab once a plugin at work in it takes settings of it. */
function withPluginsTab(sections: NavSection[], shown: boolean): NavSection[] {
  return shown
    ? sections
    : sections.map((section) => ({
        ...section,
        items: section.items.filter(({ to }) => to !== PROJECT_PLUGINS_PATH),
      }));
}

function ProjectLayout() {
  const { t, locale } = useI18n();
  const { projectKey } = projectRoute.useParams();
  const project = useQuery(ProjectsQueries.detail(projectKey));
  const plugins = useQuery({
    ...PluginsQueries.inProject(projectKey),
    enabled: Boolean(project.data && can(project.data.permissions, 'project.settings.manage')),
  });
  const { data: pluginScreens } = useQuery({
    ...PluginsQueries.projectScreens(projectKey),
    enabled: project.isSuccess,
  });
  const pluginSections = pluginNavSections(pluginScreens ?? [], locale, (screen) => ({
    to: '/projects/$projectKey/p/$pluginSlug/$screen',
    params: { projectKey, pluginSlug: screen.pluginSlug, screen: screen.name },
  }));

  if (project.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('projects.loading')}
      </p>
    );
  }
  if (project.isError) {
    const missing = project.error instanceof ApiRequestError && project.error.status === 404;
    return (
      <Page title={missing ? t('notFound.title') : projectKey}>
        <EmptyState
          icon={FolderXIcon}
          title={missing ? t('notFound.title') : t('errors.unexpected')}
          description={missing ? t('projects.notFound') : requestErrorMessage(project.error, t)}
        />
      </Page>
    );
  }
  const sections = withPluginsTab(
    visibleSections(PROJECT_ADMIN_NAV, { permissions: project.data.permissions }),
    (plugins.data?.length ?? 0) > 0,
  );
  if (sections.length === 0 && pluginSections.length === 0) {
    return (
      <Page title={project.data.name}>
        <AccessDenied />
      </Page>
    );
  }
  return (
    <SectionLayout
      label={t('projectAdmin.navLabel')}
      header={<ProjectIdentity project={project.data} />}
      sections={sections}
      addedSections={pluginSections}
    >
      <Outlet />
    </SectionLayout>
  );
}
