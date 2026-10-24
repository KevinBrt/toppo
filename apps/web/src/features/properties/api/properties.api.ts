import {
  type CreatePropertyRequest,
  createPropertyResponseSchema,
  type PropertiesResponse,
  propertiesResponseSchema,
  type UpdatePropertyRequest,
} from '@toppo/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

const propertyPath = (propertyId: string) => `/api/v1/properties/${encodeURIComponent(propertyId)}`;

/** Server calls about the properties the instance's issues take (Version, Team…). */
export const Properties = {
  /** Every property, oldest first, with how many issues have each option. */
  async list(): Promise<PropertiesResponse['properties']> {
    return (await apiRequest('/api/v1/properties', { schema: propertiesResponseSchema }))
      .properties;
  },

  /** Adds a property with its options; answers its id. */
  async create(request: CreatePropertyRequest): Promise<string> {
    return (
      await apiRequest('/api/v1/properties', {
        method: 'POST',
        body: request,
        schema: createPropertyResponseSchema,
      })
    ).id;
  },

  /** Saves a property and all its options, taking those it removes off their issues. */
  async update(propertyId: string, request: UpdatePropertyRequest): Promise<void> {
    await apiRequest(propertyPath(propertyId), {
      method: 'PUT',
      body: request,
      schema: z.null(),
    });
  },

  /** Deletes a property; its values leave their issues. */
  async remove(propertyId: string): Promise<void> {
    await apiRequest(propertyPath(propertyId), { method: 'DELETE', schema: z.null() });
  },
};
