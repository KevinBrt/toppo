import { queryOptions } from '@tanstack/react-query';
import { PluginScreens } from '../api/plugin-screens.api.ts';
import { Plugins } from '../api/plugins.api.ts';
import type { PickedItem } from '../models/plugin-overlay.model.ts';

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
  /** A plugin's dialogs the person may open, and its name, asked once one of its screens opens one. */
  dialogs: (pluginSlug: string) =>
    queryOptions({
      queryKey: ['plugins', 'screens', 'dialogs', pluginSlug],
      queryFn: () => PluginScreens.dialogs(pluginSlug),
      staleTime: 60 * 1000,
    }),
  /**
   * What Toppo's search finds for a plugin's screen, as the person types: each found as the list
   * shows it, and as the screen is answered it.
   */
  pick: (pluginSlug: string, of: 'issue' | 'people', search: string, projectId?: string) =>
    queryOptions({
      queryKey: ['plugins', 'pick', pluginSlug, of, search, projectId ?? null],
      queryFn: (): Promise<PickedItem[]> =>
        of === 'issue'
          ? PluginScreens.pickIssues(pluginSlug, { search, projectId }).then((issues) =>
              issues.map((issue) => ({
                id: issue.id,
                label: issue.title,
                hint: issue.key,
                value: issue,
              })),
            )
          : PluginScreens.pickPeople(pluginSlug, { search, projectId }).then((people) =>
              people.map((person) => ({
                id: person.id,
                label: person.name,
                hint: '',
                value: person,
              })),
            ),
    }),
};
