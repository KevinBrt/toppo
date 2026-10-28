import {
  type LabelsRequest,
  type LabelsResponse,
  labelsResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the instance's labels. */
export const Labels = {
  /** Every label by name, with how many issues each has. */
  async list(): Promise<LabelsResponse['labels']> {
    return (await apiRequest('/api/v1/labels', { schema: labelsResponseSchema })).labels;
  },

  /** Saves the whole list at once, taking the labels it removes off their issues. */
  async save(request: LabelsRequest): Promise<void> {
    await apiRequest('/api/v1/labels', { method: 'PUT', body: request, schema: z.null() });
  },
};
