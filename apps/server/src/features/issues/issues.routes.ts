import {
  assignedIssuesResponseSchema,
  assigneesResponseSchema,
  assignIssueRequestSchema,
  bulkAssigneeRequestSchema,
  bulkDeleteRequestSchema,
  bulkFieldsRequestSchema,
  bulkIssuesResponseSchema,
  bulkLabelsRequestSchema,
  bulkStatusRequestSchema,
  changeIssueStatusRequestSchema,
  createIssueRequestSchema,
  createIssueResponseSchema,
  issueActivitiesQuerySchema,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueFollowingRequestSchema,
  issueKeyParamsSchema,
  issueLabelsRequestSchema,
  issuePropertyParamsSchema,
  issuePropertyRequestSchema,
  issueResponseSchema,
  issueSearchQuerySchema,
  issueSearchResponseSchema,
  issuesQuerySchema,
  issuesResponseSchema,
  markDuplicateRequestSchema,
  pickerQuerySchema,
  projectIssuesParamsSchema,
  projectIssuesQuerySchema,
  updateIssueRequestSchema,
} from '@toppo-tracker/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ZodTypeProvider } from '../../platform/http/zod.ts';
import { assignIssue } from './commands/assign-issue.command.ts';
import { bulkAssignIssues } from './commands/bulk/assign-issues.command.ts';
import { bulkChangeStatus } from './commands/bulk/change-issues-status.command.ts';
import { bulkDeleteIssues } from './commands/bulk/delete-issues.command.ts';
import { bulkLabelIssues } from './commands/bulk/label-issues.command.ts';
import { bulkUpdateIssues } from './commands/bulk/update-issues.command.ts';
import { changeIssueStatus } from './commands/change-issue-status.command.ts';
import { createIssue } from './commands/create-issue.command.ts';
import { deleteIssue } from './commands/delete-issue.command.ts';
import { markDuplicate } from './commands/duplicates/mark-duplicate.command.ts';
import { unmarkDuplicate } from './commands/duplicates/unmark-duplicate.command.ts';
import { followIssue } from './commands/follow-issue.command.ts';
import { setIssueLabels } from './commands/set-issue-labels.command.ts';
import { setIssueProperty } from './commands/set-issue-property.command.ts';
import { updateIssue } from './commands/update-issue.command.ts';
import { getIssue } from './queries/get-issue.query.ts';
import { getIssueFields } from './queries/get-issue-fields.query.ts';
import { listAssignedIssues } from './queries/list-assigned-issues.query.ts';
import { listAssignees } from './queries/list-assignees.query.ts';
import { listIssueActivities } from './queries/list-issue-activities.query.ts';
import { listIssues } from './queries/list-issues.query.ts';
import { searchIssues } from './queries/search-issues.query.ts';

/** Commands answer `204 No Content`: the client refetches what it shows. */
const NO_CONTENT = { 204: z.void() };

/**
 * A project's issues, those assigned to the caller, and each issue by its key
 * (`/api/v1/issues/WEB-42`). An issue the caller does not see answers 404, like a project out of
 * reach.
 */
export function registerIssueRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/issues/assigned',
    {
      config: { access: listAssignedIssues.access },
      schema: { querystring: issuesQuerySchema, response: { 200: assignedIssuesResponseSchema } },
    },
    (request) => listAssignedIssues.execute(request.executionContext, request.query),
  );

  routes.get(
    '/api/v1/issues/search',
    {
      config: { access: searchIssues.access },
      schema: { querystring: issueSearchQuerySchema, response: { 200: issueSearchResponseSchema } },
    },
    (request) => searchIssues.execute(request.executionContext, request.query),
  );

  routes.get(
    '/api/v1/projects/:projectKey/issues',
    {
      config: { access: listIssues.access },
      schema: {
        params: projectIssuesParamsSchema,
        querystring: projectIssuesQuerySchema,
        response: { 200: issuesResponseSchema },
      },
    },
    (request) =>
      listIssues.execute(request.executionContext, { ...request.params, ...request.query }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/issues',
    {
      config: { access: createIssue.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: createIssueRequestSchema,
        response: { 201: createIssueResponseSchema },
      },
    },
    async (request, reply) =>
      reply.status(201).send(
        await createIssue.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  // Actions on several issues of a project: each issue takes the change if it may.
  routes.post(
    '/api/v1/projects/:projectKey/issues/bulk/status',
    {
      config: { access: bulkChangeStatus.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: bulkStatusRequestSchema,
        response: { 200: bulkIssuesResponseSchema },
      },
    },
    (request) =>
      bulkChangeStatus.execute(request.executionContext, { ...request.params, ...request.body }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/issues/bulk/fields',
    {
      config: { access: bulkUpdateIssues.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: bulkFieldsRequestSchema,
        response: { 200: bulkIssuesResponseSchema },
      },
    },
    (request) =>
      bulkUpdateIssues.execute(request.executionContext, { ...request.params, ...request.body }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/issues/bulk/assignee',
    {
      config: { access: bulkAssignIssues.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: bulkAssigneeRequestSchema,
        response: { 200: bulkIssuesResponseSchema },
      },
    },
    (request) =>
      bulkAssignIssues.execute(request.executionContext, { ...request.params, ...request.body }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/issues/bulk/labels',
    {
      config: { access: bulkLabelIssues.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: bulkLabelsRequestSchema,
        response: { 200: bulkIssuesResponseSchema },
      },
    },
    (request) =>
      bulkLabelIssues.execute(request.executionContext, { ...request.params, ...request.body }),
  );

  routes.post(
    '/api/v1/projects/:projectKey/issues/bulk/delete',
    {
      config: { access: bulkDeleteIssues.access },
      schema: {
        params: projectIssuesParamsSchema,
        body: bulkDeleteRequestSchema,
        response: { 200: bulkIssuesResponseSchema },
      },
    },
    (request) =>
      bulkDeleteIssues.execute(request.executionContext, { ...request.params, ...request.body }),
  );

  routes.get(
    '/api/v1/projects/:projectKey/issue-fields',
    {
      config: { access: getIssueFields.access },
      schema: { params: projectIssuesParamsSchema, response: { 200: issueFieldsResponseSchema } },
    },
    (request) => getIssueFields.execute(request.executionContext, request.params),
  );

  routes.get(
    '/api/v1/projects/:projectKey/assignees',
    {
      config: { access: listAssignees.access },
      schema: {
        params: projectIssuesParamsSchema,
        querystring: pickerQuerySchema,
        response: { 200: assigneesResponseSchema },
      },
    },
    (request) =>
      listAssignees.execute(request.executionContext, { ...request.params, ...request.query }),
  );

  registerIssueKeyRoutes(app);
}

/** One issue, named by its key. */
function registerIssueKeyRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/v1/issues/:issueKey',
    {
      config: { access: getIssue.access },
      schema: { params: issueKeyParamsSchema, response: { 200: issueResponseSchema } },
    },
    (request) => getIssue.execute(request.executionContext, request.params),
  );

  routes.patch(
    '/api/v1/issues/:issueKey',
    {
      config: { access: updateIssue.access },
      schema: {
        params: issueKeyParamsSchema,
        body: updateIssueRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await updateIssue.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/issues/:issueKey/status',
    {
      config: { access: changeIssueStatus.access },
      schema: {
        params: issueKeyParamsSchema,
        body: changeIssueStatusRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await changeIssueStatus.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/issues/:issueKey/properties/:propertyId',
    {
      config: { access: setIssueProperty.access },
      schema: {
        params: issuePropertyParamsSchema,
        body: issuePropertyRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await setIssueProperty.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/issues/:issueKey/duplicate-of',
    {
      config: { access: markDuplicate.access },
      schema: {
        params: issueKeyParamsSchema,
        body: markDuplicateRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await markDuplicate.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/issues/:issueKey/duplicate-of',
    {
      config: { access: unmarkDuplicate.access },
      schema: { params: issueKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply
        .status(204)
        .send(await unmarkDuplicate.execute(request.executionContext, request.params)),
  );

  routes.put(
    '/api/v1/issues/:issueKey/following',
    {
      config: { access: followIssue.access },
      schema: {
        params: issueKeyParamsSchema,
        body: issueFollowingRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await followIssue.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/issues/:issueKey/labels',
    {
      config: { access: setIssueLabels.access },
      schema: {
        params: issueKeyParamsSchema,
        body: issueLabelsRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await setIssueLabels.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.put(
    '/api/v1/issues/:issueKey/assignee',
    {
      config: { access: assignIssue.access },
      schema: {
        params: issueKeyParamsSchema,
        body: assignIssueRequestSchema,
        response: NO_CONTENT,
      },
    },
    async (request, reply) =>
      reply.status(204).send(
        await assignIssue.execute(request.executionContext, {
          ...request.params,
          ...request.body,
        }),
      ),
  );

  routes.delete(
    '/api/v1/issues/:issueKey',
    {
      config: { access: deleteIssue.access },
      schema: { params: issueKeyParamsSchema, response: NO_CONTENT },
    },
    async (request, reply) =>
      reply.status(204).send(await deleteIssue.execute(request.executionContext, request.params)),
  );

  routes.get(
    '/api/v1/issues/:issueKey/activities',
    {
      config: { access: listIssueActivities.access },
      schema: {
        params: issueKeyParamsSchema,
        querystring: issueActivitiesQuerySchema,
        response: { 200: issueActivitiesResponseSchema },
      },
    },
    (request) =>
      listIssueActivities.execute(request.executionContext, {
        ...request.params,
        ...request.query,
      }),
  );
}
