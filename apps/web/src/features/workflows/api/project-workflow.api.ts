import {
  type ProjectWorkflowResponse,
  projectWorkflowResponseSchema,
  type RevertWorkflowRequest,
  type WorkflowRequest,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const workflowPath = (projectKey: string) =>
  `/api/v1/projects/${encodeURIComponent(projectKey)}/workflow`;

/** Server calls about a project's workflow: the instance's it follows, or a copy of its own. */
export const ProjectWorkflow = {
  async get(projectKey: string): Promise<ProjectWorkflowResponse> {
    return await apiRequest(workflowPath(projectKey), { schema: projectWorkflowResponseSchema });
  },

  /** Gives the project a copy of the instance's workflow; no issue moves. */
  async customize(projectKey: string): Promise<void> {
    await apiRequest(`${workflowPath(projectKey)}/customize`, {
      method: 'POST',
      schema: noContent,
    });
  },

  /** Saves the project's own workflow whole. */
  async save(projectKey: string, request: WorkflowRequest): Promise<void> {
    await apiRequest(workflowPath(projectKey), { method: 'PUT', body: request, schema: noContent });
  },

  /** Follows the instance's workflow again, the issues on the project's own statuses moving. */
  async revert(projectKey: string, moves: RevertWorkflowRequest['moves']): Promise<void> {
    await apiRequest(`${workflowPath(projectKey)}/revert`, {
      method: 'POST',
      body: { moves },
      schema: noContent,
    });
  },
};
