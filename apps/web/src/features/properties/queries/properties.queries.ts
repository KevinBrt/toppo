import { queryOptions } from '@tanstack/react-query';
import { Categories } from '../api/categories.api.ts';
import { Labels } from '../api/labels.api.ts';
import { Priorities } from '../api/priorities.api.ts';
import { ProjectProperties } from '../api/project-properties.api.ts';
import { Properties } from '../api/properties.api.ts';

/** Cached settings of the issues' properties. Keys start with `properties`. */
export const PropertiesQueries = {
  /** Everything about properties, to refresh it all after a change. */
  all: ['properties'] as const,
  categories: queryOptions({
    queryKey: ['properties', 'categories'],
    queryFn: () => Categories.list(),
  }),
  priorities: queryOptions({
    queryKey: ['properties', 'priorities'],
    queryFn: () => Priorities.list(),
  }),
  labels: queryOptions({
    queryKey: ['properties', 'labels'],
    queryFn: () => Labels.list(),
  }),
  /** The properties admins add: Version, Team… */
  custom: queryOptions({
    queryKey: ['properties', 'custom'],
    queryFn: () => Properties.list(),
  }),
  /** How a project adapts the issues' fields, and its own properties. */
  project: (projectKey: string) =>
    queryOptions({
      queryKey: ['properties', 'project', projectKey],
      queryFn: () => ProjectProperties.list(projectKey),
    }),
};
