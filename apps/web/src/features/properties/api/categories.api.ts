import {
  type CategoriesRequest,
  type CategoriesResponse,
  categoriesResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Server calls about the instance's categories of issues. */
export const Categories = {
  /** Every category in its order, with how many issues each has. */
  async list(): Promise<CategoriesResponse['categories']> {
    return (await apiRequest('/api/v1/categories', { schema: categoriesResponseSchema }))
      .categories;
  },

  /** Saves the whole list at once, deleting the categories it removes. */
  async save(request: CategoriesRequest): Promise<void> {
    await apiRequest('/api/v1/categories', { method: 'PUT', body: request, schema: z.null() });
  },
};
