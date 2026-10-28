import {
  type CreateProjectRequest,
  createProjectResponseSchema,
  type ProjectResponse,
  type ProjectsQuery,
  type ProjectsResponse,
  projectResponseSchema,
  projectsResponseSchema,
  type UpdateProjectRequest,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

export const projectPath = (key: string) => `/api/v1/projects/${encodeURIComponent(key)}`;

/** Server calls about projects. A project out of the caller's reach answers 404. */
export const Projects = {
  /** One page of the projects the caller reaches, or manages: the server searches and pages. */
  async list({ scope, state, search, page }: ProjectsQuery): Promise<ProjectsResponse> {
    const params = new URLSearchParams();
    if (scope === 'managed') {
      params.set('scope', scope);
    }
    if (state === 'archived') {
      params.set('state', state);
    }
    if (search) {
      params.set('search', search);
    }
    if (page && page > 1) {
      params.set('page', String(page));
    }
    const query = params.size > 0 ? `?${params}` : '';
    return await apiRequest(`/api/v1/projects${query}`, { schema: projectsResponseSchema });
  },

  /** Creates a project the caller then has access to; answers its key. */
  async create(project: CreateProjectRequest): Promise<string> {
    return (
      await apiRequest('/api/v1/projects', {
        method: 'POST',
        body: project,
        schema: createProjectResponseSchema,
      })
    ).key;
  },

  /** A project, with what the caller may do in it. */
  async get(key: string): Promise<ProjectResponse> {
    return await apiRequest(projectPath(key), { schema: projectResponseSchema });
  },

  async update(key: string, project: UpdateProjectRequest): Promise<void> {
    await apiRequest(projectPath(key), { method: 'PATCH', body: project, schema: noContent });
  },

  async archive(key: string): Promise<void> {
    await apiRequest(`${projectPath(key)}/archive`, { method: 'POST', schema: noContent });
  },

  async unarchive(key: string): Promise<void> {
    await apiRequest(`${projectPath(key)}/unarchive`, { method: 'POST', schema: noContent });
  },

  /** For good: the project, its issues and their history. */
  async delete(key: string): Promise<void> {
    await apiRequest(projectPath(key), { method: 'DELETE', schema: noContent });
  },
};
