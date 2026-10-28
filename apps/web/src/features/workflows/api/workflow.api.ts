import {
  type WorkflowRequest,
  type WorkflowResponse,
  workflowResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the instance's workflow, which projects follow until they copy it. */
export const Workflow = {
  async get(): Promise<WorkflowResponse> {
    return await apiRequest('/api/v1/workflow', { schema: workflowResponseSchema });
  },

  /** Saves the whole workflow at once; the issues of a status taken out move as it says. */
  async save(request: WorkflowRequest): Promise<void> {
    await apiRequest('/api/v1/workflow', { method: 'PUT', body: request, schema: z.null() });
  },
};
