import {
  assignableRolesResponseSchema,
  changeUserRoleRequestSchema,
  membersQuerySchema,
  membersResponseSchema,
  peopleQuerySchema,
  peopleResponseSchema,
  pickerQuerySchema,
  userIdParamsSchema,
  userProjectAccessRequestSchema,
  userProjectParamsSchema,
  userProjectsResponseSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { changeUserRole } from './commands/change-user-role.command.ts';
import { deactivateUser } from './commands/deactivate-user.command.ts';
import { deleteUser } from './commands/delete-user.command.ts';
import { addUserToProject } from './commands/projects/add-user-to-project.command.ts';
import { removeUserFromProject } from './commands/projects/remove-user-from-project.command.ts';
import { setUserProjectAccess } from './commands/projects/set-user-project-access.command.ts';
import { reactivateUser } from './commands/reactivate-user.command.ts';
import { listAssignableRoles } from './queries/list-assignable-roles.query.ts';
import { listMembers } from './queries/list-members.query.ts';
import { listPeople } from './queries/list-people.query.ts';
import { listUserProjects } from './queries/list-user-projects.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** Members of the instance, managed by holders of `instance.users.manage`; people by name. */
export function registerUserRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/members',
    {
      config: { access: listMembers.access },
      schema: { querystring: membersQuerySchema, response: { 200: membersResponseSchema } },
    },
    (request) => listMembers.execute(request.executionContext, request.query),
  );

  routes.get(
    '/api/v1/people',
    {
      config: { access: listPeople.access },
      schema: { querystring: peopleQuerySchema, response: { 200: peopleResponseSchema } },
    },
    (request) => listPeople.execute(request.executionContext, request.query),
  );

  routes.get(
    '/api/v1/users/roles',
    {
      config: { access: listAssignableRoles.access },
      schema: { response: { 200: assignableRolesResponseSchema } },
    },
    (request) => listAssignableRoles.execute(request.executionContext, {}),
  );

  routes.patch(
    '/api/v1/users/:userId',
    {
      config: { access: changeUserRole.access },
      schema: {
        params: userIdParamsSchema,
        body: changeUserRoleRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await changeUserRole.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.post(
    '/api/v1/users/:userId/deactivate',
    {
      config: { access: deactivateUser.access },
      schema: { params: userIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await deactivateUser.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/users/:userId/reactivate',
    {
      config: { access: reactivateUser.access },
      schema: { params: userIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await reactivateUser.execute(request.executionContext, request.params)),
  );

  routes.delete(
    '/api/v1/users/:userId',
    {
      config: { access: deleteUser.access },
      schema: { params: userIdParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteUser.execute(request.executionContext, request.params)),
  );

  registerProjectAccessRoutes(app);
}

/** A member's access to projects, from the members list. */
function registerProjectAccessRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/users/:userId/projects',
    {
      config: { access: listUserProjects.access },
      schema: {
        params: userIdParamsSchema,
        querystring: pickerQuerySchema,
        response: { 200: userProjectsResponseSchema },
      },
    },
    (request) =>
      listUserProjects.execute(request.executionContext, { ...request.params, ...request.query }),
  );

  routes.put(
    '/api/v1/users/:userId/projects',
    {
      config: { access: setUserProjectAccess.access },
      schema: {
        params: userIdParamsSchema,
        body: userProjectAccessRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await setUserProjectAccess.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/users/:userId/projects/:projectKey',
    {
      config: { access: addUserToProject.access },
      schema: { params: userProjectParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await addUserToProject.execute(request.executionContext, request.params)),
  );

  routes.delete(
    '/api/v1/users/:userId/projects/:projectKey',
    {
      config: { access: removeUserFromProject.access },
      schema: { params: userProjectParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await removeUserFromProject.execute(request.executionContext, request.params)),
  );
}
