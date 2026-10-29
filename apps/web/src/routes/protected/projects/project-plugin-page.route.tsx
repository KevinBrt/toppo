import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { type ScreenSearch, screenSearchSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { PluginsQueries } from '../../../features/plugins/queries/plugins.queries.ts';
import { ProjectsQueries } from '../../../features/projects/queries/projects.queries.ts';
import { PluginScreenPage, usePluginNavigation } from '../plugins/plugin-page.route.tsx';
import { projectRoute } from './project.route.tsx';

/** A tab a plugin adds to a project's settings: its screen, shown for that project. */
export const projectPluginPageRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/p/$pluginSlug/$screen',
  validateSearch: (search): ScreenSearch => screenSearchSchema.catch({}).parse(search),
  component: ProjectPluginPageScreen,
});

function ProjectPluginPageScreen() {
  const { projectKey, pluginSlug, screen } = projectPluginPageRoute.useParams();
  const search = projectPluginPageRoute.useSearch();
  const navigate = useNavigate({ from: projectPluginPageRoute.fullPath });
  const open = usePluginNavigation(projectKey);
  const { data: project } = useQuery(ProjectsQueries.detail(projectKey));
  const screens = useQuery(PluginsQueries.projectScreens(projectKey));

  return project ? (
    <PluginScreenPage
      pluginSlug={pluginSlug}
      screen={screen}
      screens={screens}
      search={search}
      project={{ id: project.id, key: project.key, name: project.name }}
      onSearch={(next) => void navigate({ search: next, replace: true })}
      onOpen={(target) => open(pluginSlug, target)}
    />
  ) : null;
}
