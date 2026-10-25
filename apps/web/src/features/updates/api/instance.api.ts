import { type InstanceVersionResponse, instanceVersionResponseSchema } from '@toppo/shared';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the instance itself. */
export const Instance = {
  /** The version running, and a newer one published for whoever manages the instance. */
  async version(): Promise<InstanceVersionResponse> {
    return await apiRequest('/api/v1/instance/version', { schema: instanceVersionResponseSchema });
  },
};
