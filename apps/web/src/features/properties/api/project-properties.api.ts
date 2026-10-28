import {
  type CreatePropertyRequest,
  createPropertyResponseSchema,
  type ProjectFields,
  type ProjectPropertiesResponse,
  type PropertyAdaptationRequest,
  projectPropertiesResponseSchema,
  type UpdatePropertyRequest,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

const projectPath = (projectKey: string) => `/api/v1/projects/${encodeURIComponent(projectKey)}`;
const propertyPath = (projectKey: string, propertyId: string) =>
  `${projectPath(projectKey)}/properties/${encodeURIComponent(propertyId)}`;

/** Server calls about how a project adapts the issues' fields, and its own properties. */
export const ProjectProperties = {
  async list(projectKey: string): Promise<ProjectPropertiesResponse> {
    return await apiRequest(`${projectPath(projectKey)}/properties`, {
      schema: projectPropertiesResponseSchema,
    });
  },

  /** Hides the category or the priority in the project, or asks for it without a default. */
  async saveFields(projectKey: string, fields: ProjectFields): Promise<void> {
    await apiRequest(`${projectPath(projectKey)}/fields`, {
      method: 'PUT',
      body: fields,
      schema: z.null(),
    });
  },

  /** Hides a property of the instance in the project, or gives it options of its own. */
  async adapt(
    projectKey: string,
    propertyId: string,
    request: PropertyAdaptationRequest,
  ): Promise<void> {
    await apiRequest(`${propertyPath(projectKey, propertyId)}/adaptation`, {
      method: 'PUT',
      body: request,
      schema: z.null(),
    });
  },

  /** Adds a property of the project's own; answers its id. */
  async create(projectKey: string, request: CreatePropertyRequest): Promise<string> {
    return (
      await apiRequest(`${projectPath(projectKey)}/properties`, {
        method: 'POST',
        body: request,
        schema: createPropertyResponseSchema,
      })
    ).id;
  },

  async update(
    projectKey: string,
    propertyId: string,
    request: UpdatePropertyRequest,
  ): Promise<void> {
    await apiRequest(propertyPath(projectKey, propertyId), {
      method: 'PUT',
      body: request,
      schema: z.null(),
    });
  },

  async remove(projectKey: string, propertyId: string): Promise<void> {
    await apiRequest(propertyPath(projectKey, propertyId), { method: 'DELETE', schema: z.null() });
  },
};
