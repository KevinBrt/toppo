import {
  addProjectMembersRequestSchema,
  assignableRolesResponseSchema,
  changeProjectMemberRoleRequestSchema,
  createProjectRequestSchema,
  createProjectResponseSchema,
  pickerQuerySchema,
  projectAccessQuerySchema,
  projectAccessResponseSchema,
  projectCandidatesResponseSchema,
  projectInvitationParamsSchema,
  projectKeyParamsSchema,
  projectMemberParamsSchema,
  projectResponseSchema,
  projectsQuerySchema,
  projectsResponseSchema,
  updateProjectRequestSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { archiveProject } from './commands/archive-project.command.ts';
import { createProject } from './commands/create-project.command.ts';
import { deleteProject } from './commands/delete-project.command.ts';
import { addProjectMembers } from './commands/members/add-project-members.command.ts';
import { changeProjectMemberRole } from './commands/members/change-project-member-role.command.ts';
import { removeProjectInvitation } from './commands/members/remove-project-invitation.command.ts';
import { removeProjectMember } from './commands/members/remove-project-member.command.ts';
import { unarchiveProject } from './commands/unarchive-project.command.ts';
import { updateProject } from './commands/update-project.command.ts';
import { getProject } from './queries/get-project.query.ts';
import { listProjects } from './queries/list-projects.query.ts';
import { listProjectAccess } from './queries/members/list-project-access.query.ts';
import { listProjectCandidates } from './queries/members/list-project-candidates.query.ts';
import { listProjectRoles } from './queries/members/list-project-roles.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/** Projects, as their members reach them. A project out of reach answers 404. */
export function registerProjectRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/projects',
    {
      config: { access: listProjects.access },
      schema: { querystring: projectsQuerySchema, response: { 200: projectsResponseSchema } },
    },
    (request) => listProjects.execute(request.executionContext, request.query),
  );

  routes.post(
    '/api/v1/projects',
    {
      config: { access: createProject.access },
      schema: { body: createProjectRequestSchema, response: { 201: createProjectResponseSchema } },
    },
    async (request, reply) =>
      reply.status(201).send(await createProject.execute(request.executionContext, request.body)),
  );

  routes.get(
    '/api/v1/projects/:projectKey',
    {
      config: { access: getProject.access },
      schema: { params: projectKeyParamsSchema, response: { 200: projectResponseSchema } },
    },
    (request) => getProject.execute(request.executionContext, request.params),
  );

  routes.patch(
    '/api/v1/projects/:projectKey',
    {
      config: { access: updateProject.access },
      schema: {
        params: projectKeyParamsSchema,
        body: updateProjectRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateProject.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.post(
    '/api/v1/projects/:projectKey/archive',
    {
      config: { access: archiveProject.access },
      schema: { params: projectKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await archiveProject.execute(request.executionContext, request.params)),
  );

  routes.post(
    '/api/v1/projects/:projectKey/unarchive',
    {
      config: { access: unarchiveProject.access },
      schema: { params: projectKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await unarchiveProject.execute(request.executionContext, request.params)),
  );

  routes.delete(
    '/api/v1/projects/:projectKey',
    {
      config: { access: deleteProject.access },
      schema: { params: projectKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteProject.execute(request.executionContext, request.params)),
  );

  registerProjectMemberRoutes(app);
}

/**
 * Who has access to a project, and the invitations that will give it, managed by holders of
 * `project.members.manage` there.
 */
function registerProjectMemberRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/projects/:projectKey/access',
    {
      config: { access: listProjectAccess.access },
      schema: {
        params: projectKeyParamsSchema,
        querystring: projectAccessQuerySchema,
        response: { 200: projectAccessResponseSchema },
      },
    },
    (request) =>
      listProjectAccess.execute(request.executionContext, {
        ...request.params,
        ...request.query,
      }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/members',
    {
      config: { access: addProjectMembers.access },
      schema: {
        params: projectKeyParamsSchema,
        body: addProjectMembersRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await addProjectMembers.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.patch(
    '/api/v1/projects/:projectKey/members/:userId',
    {
      config: { access: changeProjectMemberRole.access },
      schema: {
        params: projectMemberParamsSchema,
        body: changeProjectMemberRoleRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await changeProjectMemberRole.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/projects/:projectKey/members/:userId',
    {
      config: { access: removeProjectMember.access },
      schema: { params: projectMemberParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await removeProjectMember.execute(request.executionContext, request.params)),
  );

  routes.delete(
    '/api/v1/projects/:projectKey/invitations/:invitationId',
    {
      config: { access: removeProjectInvitation.access },
      schema: { params: projectInvitationParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await removeProjectInvitation.execute(request.executionContext, request.params)),
  );

  routes.get(
    '/api/v1/projects/:projectKey/candidates',
    {
      config: { access: listProjectCandidates.access },
      schema: {
        params: projectKeyParamsSchema,
        querystring: pickerQuerySchema,
        response: { 200: projectCandidatesResponseSchema },
      },
    },
    (request) =>
      listProjectCandidates.execute(request.executionContext, {
        ...request.params,
        ...request.query,
      }),
  );

  routes.get(
    '/api/v1/projects/:projectKey/roles',
    {
      config: { access: listProjectRoles.access },
      schema: {
        params: projectKeyParamsSchema,
        response: { 200: assignableRolesResponseSchema },
      },
    },
    (request) => listProjectRoles.execute(request.executionContext, request.params),
  );
}
