import { useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import { type ScreenSearch, screenSearchSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { PluginsQueries } from '../../../../features/plugins/queries/plugins.queries.ts';
import { PluginScreenPage, usePluginNavigation } from '../../plugins/plugin-page.route.tsx';
import { settingsRoute } from '../settings.route.tsx';

/** A page of a plugin in the settings, in the section named after the plugin. */
export const pluginSettingsPageRoute = createRoute({
  getParentRoute: () => settingsRoute,
  path: '/p/$pluginSlug/$screen',
  validateSearch: (search): ScreenSearch => screenSearchSchema.catch({}).parse(search),
  component: PluginSettingsPageScreen,
});

function PluginSettingsPageScreen() {
  const { pluginSlug, screen } = pluginSettingsPageRoute.useParams();
  const search = pluginSettingsPageRoute.useSearch();
  const navigate = useNavigate({ from: pluginSettingsPageRoute.fullPath });
  const open = usePluginNavigation();
  const screens = useQuery({ ...PluginsQueries.screens, select: ({ settings }) => settings });

  return (
    <PluginScreenPage
      pluginSlug={pluginSlug}
      screen={screen}
      screens={screens}
      search={search}
      onSearch={(next) => void navigate({ search: next, replace: true })}
      onOpen={(target) => open(pluginSlug, target)}
    />
  );
}
