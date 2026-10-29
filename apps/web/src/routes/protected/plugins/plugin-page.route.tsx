import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { createRoute, useNavigate } from '@tanstack/react-router';
import {
  type ScreenSearch,
  type ScreenTarget,
  screenSearchSchema,
} from '@toppo-tracker/plugin-sdk/protocol';
import type { PluginScreen } from '@toppo-tracker/shared';
import { EmptyState } from '@toppo-tracker/ui';
import { PuzzleIcon } from 'lucide-react';
import { PluginFrame } from '../../../features/plugins/components/screens/plugin-frame.tsx';
import { PluginsQueries } from '../../../features/plugins/queries/plugins.queries.ts';
import { SessionQueries } from '../../../features/session/queries/session.queries.ts';
import { useI18n } from '../../../shared/i18n/i18n-provider.tsx';
import { CRUMB_CURRENT_CLASS, type CrumbProps } from '../../../shared/layout/topbar.tsx';
import { protectedRoute } from '../protected.route.tsx';

/** The screen of that plugin and name among `screens`, if it is one of them. */
function screenIn(
  screens: readonly PluginScreen[] | undefined,
  pluginSlug: string,
  screen: string,
): PluginScreen | undefined {
  return screens?.find(
    (candidate) => candidate.pluginSlug === pluginSlug && candidate.name === screen,
  );
}

/** The page's title in the top bar, its name until the title is known. */
function PluginPageCrumb({ params }: CrumbProps) {
  const { locale } = useI18n();
  const { data } = useQuery(PluginsQueries.screens);
  const screen = params['screen'] ?? '';
  return (
    <span aria-current="page" className={CRUMB_CURRENT_CLASS}>
      {screenIn(data?.main, params['pluginSlug'] ?? '', screen)?.title[locale] ?? screen}
    </span>
  );
}

/**
 * Where a screen's links lead in Toppo: an issue, or another page of the plugin, in its zone (a
 * project's tab in the project shown). Shared by every route that shows a plugin's screen.
 */
export function usePluginNavigation(projectKey?: string) {
  const navigate = useNavigate();
  const { data } = useQuery(PluginsQueries.screens);
  return (pluginSlug: string, target: ScreenTarget) => {
    if (target.to === 'issue') {
      void navigate({ to: '/issues/$issueKey', params: { issueKey: target.key } });
      return;
    }
    const params = { pluginSlug, screen: target.name };
    const search = target.search ?? {};
    if (screenIn(data?.settings, pluginSlug, target.name)) {
      void navigate({ to: '/settings/p/$pluginSlug/$screen', params, search });
    } else if (screenIn(data?.main, pluginSlug, target.name) || projectKey === undefined) {
      void navigate({ to: '/p/$pluginSlug/$screen', params, search });
    } else {
      void navigate({
        to: '/projects/$projectKey/p/$pluginSlug/$screen',
        params: { ...params, projectKey },
        search,
      });
    }
  };
}

/** A page of a plugin in the main sidebar: its screen, drawn in its frame. */
export const pluginPageRoute = createRoute({
  getParentRoute: () => protectedRoute,
  path: '/p/$pluginSlug/$screen',
  validateSearch: (search): ScreenSearch => screenSearchSchema.catch({}).parse(search),
  staticData: { crumb: PluginPageCrumb },
  component: PluginPageScreen,
});

function PluginPageScreen() {
  const { pluginSlug, screen } = pluginPageRoute.useParams();
  const search = pluginPageRoute.useSearch();
  const navigate = useNavigate({ from: pluginPageRoute.fullPath });
  const open = usePluginNavigation();
  const screens = useQuery({ ...PluginsQueries.screens, select: ({ main }) => main });

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

/**
 * A plugin's page, once the person may open it: its frame, or a page saying there is none. The
 * page's own title is the screen's (one heading, in its frame).
 */
export function PluginScreenPage({
  pluginSlug,
  screen,
  screens,
  search,
  project,
  onSearch,
  onOpen,
}: {
  pluginSlug: string;
  screen: string;
  /** The pages of its zone the person may open (the sidebar's, the settings', a project's). */
  screens: Pick<UseQueryResult<readonly PluginScreen[]>, 'data' | 'isPending'>;
  search: ScreenSearch;
  project?: { id: string; key: string; name: string };
  onSearch: (search: ScreenSearch) => void;
  onOpen: (target: ScreenTarget) => void;
}) {
  const { t, locale } = useI18n();
  const { data: user } = useQuery(SessionQueries.currentUser);
  const found = screenIn(screens.data, pluginSlug, screen);

  if (screens.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('plugins.screensLoading')}
      </p>
    );
  }
  if (!found) {
    return (
      <EmptyState
        icon={PuzzleIcon}
        title={t('notFound.title')}
        description={t('plugins.screenNotFound')}
      />
    );
  }
  return (
    <PluginFrame
      key={`${pluginSlug}/${screen}`}
      pluginSlug={pluginSlug}
      screen={screen}
      title={found.title[locale]}
      user={user ?? undefined}
      search={search}
      project={project ?? null}
      onSearch={onSearch}
      onOpen={onOpen}
    />
  );
}
