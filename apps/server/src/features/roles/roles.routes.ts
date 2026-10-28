import {
  createRoleResponseSchema,
  roleIdParamsSchema,
  rolePermissionsRequestSchema,
  roleRequestSchema,
  rolesResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { createRole } from './commands/create-role.command.ts';
import { deleteRole } from './commands/delete-role.command.ts';
import { updateRole } from './commands/update-role.command.ts';
import { updateRolePermissions } from './commands/update-role-permissions.command.ts';
import { listRoles } from './queries/list-roles.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** The roles and what they grant, managed by the system role only (`instance.roles.manage`). */
export function registerRoleRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/roles',
    {
      config: { access: listRoles.access },
      schema: { response: { 200: rolesResponseSchema } },
    },
    (request) => listRoles.execute(request.executionContext, {}),
  );

  routes.post(
    '/api/v1/roles',
    {
      config: { access: createRole.access },
      schema: { body: roleRequestSchema, response: { 201: createRoleResponseSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await createRole.execute(request.executionContext, request.body)),
  );

  routes.put(
    '/api/v1/roles/permissions',
    {
      config: { access: updateRolePermissions.access },
      schema: { body: rolePermissionsRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await updateRolePermissions.execute(request.executionContext, request.body)),
  );

  routes.patch(
    '/api/v1/roles/:roleId',
    {
      config: { access: updateRole.access },
      schema: { params: roleIdParamsSchema, body: roleRequestSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateRole.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/roles/:roleId',
    {
      config: { access: deleteRole.access },
      schema: { params: roleIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteRole.execute(request.executionContext, request.params)),
  );
}
