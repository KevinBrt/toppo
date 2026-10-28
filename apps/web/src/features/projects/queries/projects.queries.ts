import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import type { ProjectAccessQuery, ProjectsQuery } from '@toppo-tracker/shared';
import { ProjectAccess } from '../api/project-access.api.ts';
import { Projects } from '../api/projects.api.ts';

/** Cached projects data. Keys start with `projects`. */
export const ProjectsQueries = {
  /** Everything about projects, to refresh it all after a change. */
  all: ['projects'] as const,
  /** One page of the list, as the server filtered it. The previous page stays while the next loads. */
  list: (query: ProjectsQuery) =>
    queryOptions({
      queryKey: ['projects', 'list', query],
      queryFn: () => Projects.list(query),
      placeholderData: keepPreviousData,
    }),
  detail: (key: string) =>
    queryOptions({
      queryKey: ['projects', 'detail', key],
      queryFn: () => Projects.get(key),
    }),
  /** Every cached page of a project's access list, to refresh them after a change. */
  allAccess: (key: string) => ['projects', 'access', key] as const,
  access: (key: string, query: ProjectAccessQuery) =>
    queryOptions({
      queryKey: ['projects', 'access', key, query],
      queryFn: () => ProjectAccess.list(key, query),
      placeholderData: keepPreviousData,
    }),
  candidates: (key: string, search: string) =>
    queryOptions({
      queryKey: ['projects', 'candidates', key, search],
      queryFn: () => ProjectAccess.candidates(key, search),
      placeholderData: keepPreviousData,
    }),
  roles: (key: string) =>
    queryOptions({
      queryKey: ['projects', 'roles', key],
      queryFn: () => ProjectAccess.roles(key),
    }),
};
