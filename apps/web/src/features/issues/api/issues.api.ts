import {
  type AssignedIssuesResponse,
  type AssigneesResponse,
  assignedIssuesResponseSchema,
  assigneesResponseSchema,
  type BulkIssuesResponse,
  bulkIssuesResponseSchema,
  type CreateIssueRequest,
  createIssueResponseSchema,
  formatPropertyFilters,
  type IssueActivitiesResponse,
  type IssueFieldsResponse,
  type IssueResponse,
  type IssueSearchResponse,
  type IssuesQuery,
  type IssuesResponse,
  issueActivitiesResponseSchema,
  issueFieldsResponseSchema,
  issueResponseSchema,
  issueSearchResponseSchema,
  issuesResponseSchema,
  type ProjectIssuesQuery,
  type PropertyValue,
  type UpdateIssueRequest,
} from '@toppo/shared';
import { z } from 'zod';
import { apiRequest } from '../../../shared/api/http.client.ts';
import type { BulkChange } from '../models/bulk-change.model.ts';

/** Commands answer `204 No Content`. */
const noContent = z.null();

const projectPath = (projectKey: string) => `/api/v1/projects/${encodeURIComponent(projectKey)}`;
const issuePath = (key: string) => `/api/v1/issues/${encodeURIComponent(key)}`;

/** `?page=2`, or nothing on the first page. */
const pageQuery = (page: number | undefined) =>
  page && page > 1 ? `?${new URLSearchParams({ page: String(page) })}` : '';

/** `?state=open&status=a,b`: what a project's list asks for, its lists joined by commas. */
function listQuery(query: ProjectIssuesQuery): string {
  const entries = {
    page: query.page && query.page > 1 ? String(query.page) : undefined,
    search: query.search,
    state: query.state,
    status: query.status?.join(','),
    priority: query.priority?.join(','),
    category: query.category?.join(','),
    label: query.label?.join(','),
    assignee: query.assignee?.join(','),
    reporter: query.reporter?.join(','),
    property: query.property?.length ? formatPropertyFilters(query.property) : undefined,
    sort: query.sort,
    order: query.order,
    group: query.group,
  };
  const params = new URLSearchParams(
    Object.entries(entries).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return params.size > 0 ? `?${params}` : '';
}

/** Server calls about issues, each named by its key (`WEB-42`). One out of sight answers 404. */
export const Issues = {
  /** One page of a project's issues, searched, filtered, sorted and maybe grouped. */
  async list(projectKey: string, query: ProjectIssuesQuery): Promise<IssuesResponse> {
    return await apiRequest(`${projectPath(projectKey)}/issues${listQuery(query)}`, {
      schema: issuesResponseSchema,
    });
  },

  /** One page of the issues assigned to the caller, in every project, the most urgent first. */
  async assigned({ page }: IssuesQuery): Promise<AssignedIssuesResponse> {
    return await apiRequest(`/api/v1/issues/assigned${pageQuery(page)}`, {
      schema: assignedIssuesResponseSchema,
    });
  },

  /** The issues `text` finds in every project the caller reaches: the best ten. */
  async search(text: string): Promise<IssueSearchResponse> {
    return await apiRequest(`/api/v1/issues/search?${new URLSearchParams({ search: text })}`, {
      schema: issueSearchResponseSchema,
    });
  },

  /** Reports an issue; answers its key. */
  async create(projectKey: string, issue: CreateIssueRequest): Promise<string> {
    return (
      await apiRequest(`${projectPath(projectKey)}/issues`, {
        method: 'POST',
        body: issue,
        schema: createIssueResponseSchema,
      })
    ).key;
  },

  async get(key: string): Promise<IssueResponse> {
    return await apiRequest(issuePath(key), { schema: issueResponseSchema });
  },

  /** Changes only the fields given. */
  async update(key: string, changes: UpdateIssueRequest): Promise<void> {
    await apiRequest(issuePath(key), { method: 'PATCH', body: changes, schema: noContent });
  },

  /** Moves the issue to a status the workflow allows from the current one. */
  async changeStatus(key: string, statusId: string): Promise<void> {
    await apiRequest(`${issuePath(key)}/status`, {
      method: 'PUT',
      body: { statusId },
      schema: noContent,
    });
  },

  /** `null` leaves the issue to nobody. */
  async assign(key: string, assigneeId: string | null): Promise<void> {
    await apiRequest(`${issuePath(key)}/assignee`, {
      method: 'PUT',
      body: { assigneeId },
      schema: noContent,
    });
  },

  /** Follows the issue, or stops: told of its comments, status changes and assignments, or not. */
  async follow(key: string, following: boolean): Promise<void> {
    await apiRequest(`${issuePath(key)}/following`, {
      method: 'PUT',
      body: { following },
      schema: noContent,
    });
  },

  /** Applies one change to several issues of a project: each takes it if it may. */
  async bulk(
    projectKey: string,
    issueKeys: readonly string[],
    { action, ...change }: BulkChange,
  ): Promise<BulkIssuesResponse> {
    return await apiRequest(`${projectPath(projectKey)}/issues/bulk/${action}`, {
      method: 'POST',
      body: { issueKeys, ...change },
      schema: bulkIssuesResponseSchema,
    });
  },

  /** Marks the issue as a duplicate of another the caller sees, closing it in `statusId`. */
  async markDuplicate(key: string, originalKey: string, statusId: string): Promise<void> {
    await apiRequest(`${issuePath(key)}/duplicate-of`, {
      method: 'PUT',
      body: { originalKey, statusId },
      schema: noContent,
    });
  },

  /** Takes the duplicate mark off the issue, which keeps its status. */
  async unmarkDuplicate(key: string): Promise<void> {
    await apiRequest(`${issuePath(key)}/duplicate-of`, { method: 'DELETE', schema: noContent });
  },

  /** Gives the issue exactly these labels. */
  async setLabels(key: string, labelIds: string[]): Promise<void> {
    await apiRequest(`${issuePath(key)}/labels`, {
      method: 'PUT',
      body: { labelIds },
      schema: noContent,
    });
  },

  /** Gives the issue a value of a property, as stored, or takes its value away with `null`. */
  async setProperty(key: string, propertyId: string, value: PropertyValue | null): Promise<void> {
    await apiRequest(`${issuePath(key)}/properties/${encodeURIComponent(propertyId)}`, {
      method: 'PUT',
      body: { value },
      schema: noContent,
    });
  },

  /** For good: its history goes with it, its number is never given again. */
  async delete(key: string): Promise<void> {
    await apiRequest(issuePath(key), { method: 'DELETE', schema: noContent });
  },

  /** One page of the issue's history, newest first. */
  async activities(key: string, page: number): Promise<IssueActivitiesResponse> {
    return await apiRequest(`${issuePath(key)}/activities${pageQuery(page)}`, {
      schema: issueActivitiesResponseSchema,
    });
  },

  /** The statuses, categories and priorities a project's issues take. */
  async fields(projectKey: string): Promise<IssueFieldsResponse> {
    return await apiRequest(`${projectPath(projectKey)}/issue-fields`, {
      schema: issueFieldsResponseSchema,
    });
  },

  /** People issues of the project can be given to, found by the server. */
  async assignees(projectKey: string, search: string): Promise<AssigneesResponse['people']> {
    const query = search ? `?${new URLSearchParams({ search })}` : '';
    return (
      await apiRequest(`${projectPath(projectKey)}/assignees${query}`, {
        schema: assigneesResponseSchema,
      })
    ).people;
  },
};
