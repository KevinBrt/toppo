import {
  createRoleResponseSchema,
  type RolePermissionsRequest,
  type RoleRequest,
  type RolesResponse,
  rolesResponseSchema,
} from '@toppo-tracker/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const rolePath = (roleId: string) => `/api/v1/roles/${encodeURIComponent(roleId)}`;

/** Server calls about roles and what they grant, for holders of the system role. */
export const Roles = {
  /**
   * Every role, in creation order: a short configuration list; and the permissions the plugins
   * installed add, a section of the matrix each.
   */
  async list(): Promise<RolesResponse> {
    return await apiRequest('/api/v1/roles', { schema: rolesResponseSchema });
  },

  /** Creates a role without permissions and returns its id. */
  async create(role: RoleRequest): Promise<string> {
    return (
      await apiRequest('/api/v1/roles', {
        method: 'POST',
        body: role,
        schema: createRoleResponseSchema,
      })
    ).id;
  },

  async update(roleId: string, role: RoleRequest): Promise<void> {
    await apiRequest(rolePath(roleId), { method: 'PATCH', body: role, schema: noContent });
  },

  async delete(roleId: string): Promise<void> {
    await apiRequest(rolePath(roleId), { method: 'DELETE', schema: noContent });
  },

  /** Saves every changed role, or none if one of them changed since it was shown. */
  async savePermissions(changes: RolePermissionsRequest['changes']): Promise<void> {
    await apiRequest('/api/v1/roles/permissions', {
      method: 'PUT',
      body: { changes },
      schema: noContent,
    });
  },
};
