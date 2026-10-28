import {
  type PrioritiesRequest,
  type PrioritiesResponse,
  prioritiesResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the instance's four priority levels. */
export const Priorities = {
  /** The four levels, lowest first. */
  async list(): Promise<PrioritiesResponse['priorities']> {
    return (await apiRequest('/api/v1/priorities', { schema: prioritiesResponseSchema }))
      .priorities;
  },

  /** Saves the four levels' names and the default at once. */
  async save(priorities: PrioritiesRequest['priorities']): Promise<void> {
    await apiRequest('/api/v1/priorities', {
      method: 'PUT',
      body: { priorities },
      schema: z.null(),
    });
  },
};
