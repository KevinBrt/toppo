import { queryOptions } from '@tanstack/react-query';
import { PluginScreens } from '../api/plugin-screens.api.ts';
import { Plugins } from '../api/plugins.api.ts';

/** Cached plugins data. Keys start with `plugins`. */
export const PluginsQueries = {
  /** Everything about plugins, to refresh it all after a change. */
  all: ['plugins'] as const,
  /** At most 50 plugins: loaded whole. */
  list: queryOptions({
    queryKey: ['plugins', 'list'],
    queryFn: () => Plugins.list(),
  }),
  detail: (slug: string) =>
    queryOptions({
      queryKey: ['plugins', 'detail', slug],
      queryFn: () => Plugins.get(slug),
    }),
  /** The plugins at work in a project that take settings of it: at most 50, loaded whole. */
  inProject: (projectKey: string) =>
    queryOptions({
      queryKey: ['plugins', 'project', projectKey],
      queryFn: () => Plugins.inProject(projectKey),
    }),
  /** The pages of plugins the person may open, in the main sidebar and the settings. */
  screens: queryOptions({
    queryKey: ['plugins', 'screens'],
    queryFn: () => PluginScreens.list(),
  }),
  /** The tabs plugins add to a project's settings that the person may open. */
  projectScreens: (projectKey: string) =>
    queryOptions({
      queryKey: ['plugins', 'screens', 'project', projectKey],
      queryFn: () => PluginScreens.inProject(projectKey),
    }),
  /** The panels plugins show beside an issue that the person may open. */
  issuePanels: (issueKey: string) =>
    queryOptions({
      queryKey: ['plugins', 'screens', 'issue', issueKey],
      queryFn: () => PluginScreens.besideIssue(issueKey),
    }),
};
