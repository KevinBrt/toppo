import { z } from 'zod';
import { PALETTE_COLORS } from '../colors.ts';
import { userRefSchema } from '../members/users.ts';
import { projectKeySchema } from '../project-key.ts';
import { issuePropertyFieldSchema, projectFieldsSchema } from '../properties/properties.ts';
import { type PropertyFilter, propertyFiltersParameter } from '../properties/property-filters.ts';
import {
  givenPropertyValueSchema,
  issuePropertyValueSchema,
} from '../properties/property-values.ts';
import { issueDescriptionSchema, issueTitleSchema, PRIORITY_LEVELS } from './fields.ts';
import { labelRefSchema } from './labels.ts';

/** Rows per page of a project's issues. */
export const ISSUES_PAGE_SIZE = 50;

/** Changes per page of an issue's history. */
export const ISSUE_ACTIVITIES_PAGE_SIZE = 50;

/** `WEB-42`: a project key and a number, up to 9 digits so that it fits a database integer. */
export const issueKeySchema = z.string().regex(/^[A-Z][A-Z0-9]{1,9}-[1-9]\d{0,8}$/);

export const issueKeyParamsSchema = z.object({ issueKey: issueKeySchema });

export const issuePropertyParamsSchema = issueKeyParamsSchema.extend({ propertyId: z.uuid() });

export const projectIssuesParamsSchema = z.object({ projectKey: projectKeySchema });

export const projectPropertyParamsSchema = projectIssuesParamsSchema.extend({
  propertyId: z.uuid(),
});

export const issueStatusSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_COLORS),
  /** Issues on it are closed. */
  closes: z.boolean(),
});

export const issueCategorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.enum(PALETTE_COLORS),
});

export const issuePrioritySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  level: z.union(PRIORITY_LEVELS.map((level) => z.literal(level))),
});

/** What someone may do on an issue (`issueActionsOf` in `@toppo/core`); the server stays the judge. */
export const ISSUE_ACTIONS = [
  'editText',
  'attach',
  'editFields',
  'changeStatus',
  'assign',
  'delete',
  'comment',
] as const;

export type IssueAction = (typeof ISSUE_ACTIONS)[number];

/** Body of `POST /api/v1/projects/:projectKey/issues`: what is not given takes its default. */
export const createIssueRequestSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema.default(''),
  categoryId: z.uuid().optional(),
  priorityId: z.uuid().optional(),
  /** Needs `issue.assign`. */
  assigneeId: z.uuid().optional(),
  /** The value of each property given, by property id; required ones must be. */
  properties: z.record(z.uuid(), givenPropertyValueSchema).default({}),
});

export type CreateIssueRequest = z.input<typeof createIssueRequestSchema>;

export const createIssueResponseSchema = z.object({ id: z.uuid(), key: z.string() });

/** The fields of an issue changed in place, as opposed to its status and assignee. */
export const updateIssueFieldsSchema = z.object({
  title: issueTitleSchema,
  description: issueDescriptionSchema,
  categoryId: z.uuid(),
  priorityId: z.uuid(),
});

/** Body of `PATCH /api/v1/issues/:issueKey`: only the fields given change. */
export const updateIssueRequestSchema = updateIssueFieldsSchema
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

export type UpdateIssueRequest = z.input<typeof updateIssueRequestSchema>;

/** Body of `PUT /api/v1/issues/:issueKey/status`: one of the statuses the workflow allows next. */
export const changeIssueStatusRequestSchema = z.object({ statusId: z.uuid() });

/** Body of `PUT /api/v1/issues/:issueKey/assignee`: someone who reaches the project, or nobody. */
export const assignIssueRequestSchema = z.object({ assigneeId: z.uuid().nullable() });

/** Query of `GET /api/v1/issues/assigned`: a page. */
export const issuesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export interface IssuesQuery {
  page?: number | undefined;
}

/**
 * What a project's issues may be sorted by, one per column of the list: the key (the number),
 * the title, the requester, the category, the priority, the status, the assignee, the last change.
 * Each sort ends with the newest first.
 */
export const ISSUE_SORTS = [
  'key',
  'title',
  'reporter',
  'category',
  'priority',
  'status',
  'assignee',
  'updated',
] as const;

export type IssueSort = (typeof ISSUE_SORTS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;

export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * The order of each sort when none is asked: the newest, the most urgent and the latest changed
 * first; names from A to Z; categories and statuses as the administrators ordered them.
 */
export const ISSUE_SORT_ORDERS: Readonly<Record<IssueSort, SortOrder>> = {
  key: 'desc',
  title: 'asc',
  reporter: 'asc',
  category: 'asc',
  priority: 'desc',
  status: 'asc',
  assignee: 'asc',
  updated: 'desc',
};

/** What a project's issues may be grouped by, each group headed with its count. */
export const ISSUE_GROUPINGS = ['status', 'priority', 'assignee'] as const;

export type IssueGrouping = (typeof ISSUE_GROUPINGS)[number];

/** Whether an issue is still open, or closed by its status. */
export const ISSUE_STATES = ['open', 'closed'] as const;

export type IssueState = (typeof ISSUE_STATES)[number];

/**
 * A list, joined by commas in a query string (`?status=a,b`) or already split by a caller that
 * is not HTTP: each item checked, at most 50.
 */
function listParameter<T extends z.ZodType<unknown, string>>(item: T) {
  return z
    .union([
      z.string().transform((text) => text.split(',').filter((part) => part !== '')),
      z.array(z.string()),
    ])
    .pipe(z.array(item).max(50))
    .optional();
}

/**
 * Query of `GET /api/v1/projects/:projectKey/issues`: one page, filtered, sorted and maybe
 * grouped. Filters of one kind match any of their values; filters of different kinds all apply.
 */
export const projectIssuesQuerySchema = issuesQuerySchema.extend({
  state: z.enum(ISSUE_STATES).optional(),
  status: listParameter(z.uuid()),
  priority: listParameter(z.uuid()),
  category: listParameter(z.uuid()),
  /** Issues with any of these labels. */
  label: listParameter(z.uuid()),
  /** Someone, the caller (`me`), or no one (`none`). */
  assignee: listParameter(z.union([z.uuid(), z.literal('me'), z.literal('none')])),
  /** Someone, or the caller (`me`). */
  reporter: listParameter(z.union([z.uuid(), z.literal('me')])),
  /** Values or ranges of the project's properties: `<id>:<a>,<b>;<id>:<from>..<to>`. */
  property: propertyFiltersParameter,
  sort: z.enum(ISSUE_SORTS).default('key'),
  /** The sort's own order when left out (`ISSUE_SORT_ORDERS`). */
  order: z.enum(SORT_ORDERS).optional(),
  group: z.enum(ISSUE_GROUPINGS).optional(),
  /** Words of the title or description, part of the title, or the issue's key or number. */
  search: z.string().trim().max(100).optional(),
});

/** A project's list as the screen asks for it; lists travel joined by commas. */
export interface ProjectIssuesQuery extends IssuesQuery {
  state?: IssueState | undefined;
  status?: readonly string[] | undefined;
  priority?: readonly string[] | undefined;
  category?: readonly string[] | undefined;
  label?: readonly string[] | undefined;
  assignee?: readonly string[] | undefined;
  reporter?: readonly string[] | undefined;
  property?: readonly PropertyFilter[] | undefined;
  sort?: IssueSort | undefined;
  order?: SortOrder | undefined;
  group?: IssueGrouping | undefined;
  search?: string | undefined;
}

export const issueSummarySchema = z.object({
  key: z.string(),
  title: z.string(),
  status: issueStatusSchema,
  category: issueCategorySchema,
  priority: issuePrioritySchema,
  assignee: userRefSchema.nullable(),
  reporter: userRefSchema,
  /** By name. */
  labels: z.array(labelRefSchema),
  /** The values of the properties shown in the list, oldest property first. */
  properties: z.array(issuePropertyValueSchema),
  /** UTC ISO 8601. */
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type IssueSummary = z.infer<typeof issueSummarySchema>;

export const issuesResponseSchema = z.object({
  /** One page, in the order asked for, grouped first when asked. */
  rows: z.array(issueSummarySchema),
  matching: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  /**
   * When grouped: every group of the matching issues, in order, its key (the status, priority
   * or assignee's id, null for no one) and how many issues it holds, across every page.
   */
  groups: z.array(z.object({ key: z.uuid().nullable(), count: z.number().int() })).nullable(),
});

export type IssuesResponse = z.infer<typeof issuesResponseSchema>;

/** An issue with the project it belongs to, in lists across projects. */
export const issueWithProjectSchema = issueSummarySchema.extend({
  project: z.object({ key: z.string(), name: z.string(), color: z.enum(PALETTE_COLORS) }),
});

export type IssueWithProject = z.infer<typeof issueWithProjectSchema>;

/** Body of `GET /api/v1/issues/assigned`: the caller's issues, open or closed, in every project. */
export const assignedIssuesResponseSchema = z.object({
  /** One page, the most urgent first, then the newest. */
  rows: z.array(issueWithProjectSchema),
  matching: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type AssignedIssuesResponse = z.infer<typeof assignedIssuesResponseSchema>;

/** How many issues a search across projects finds at most: the best ones. */
export const ISSUE_SEARCH_LIMIT = 10;

/** Query of `GET /api/v1/issues/search`. */
export const issueSearchQuerySchema = z.object({
  search: z.string().trim().min(1).max(100),
});

export type IssueSearchQuery = z.input<typeof issueSearchQuerySchema>;

/** Body of `GET /api/v1/issues/search`: the issues found in every project the caller reaches. */
export const issueSearchResponseSchema = z.object({
  /** The issue named by its key first, then the best matches, then the latest changed. */
  rows: z.array(issueWithProjectSchema).max(ISSUE_SEARCH_LIMIT),
});

export type IssueSearchResponse = z.infer<typeof issueSearchResponseSchema>;

/** Body of `GET /api/v1/issues/:issueKey`. */
export const issueResponseSchema = issueSummarySchema.extend({
  id: z.uuid(),
  /** The values of every property it has, oldest property first. */
  properties: z.array(issuePropertyValueSchema),
  project: z.object({ key: z.string(), name: z.string() }),
  /** Markdown. */
  description: z.string(),
  /** UTC ISO 8601 date the issue was closed, or `null` while it is open. */
  closedAt: z.iso.datetime().nullable(),
  /** What the caller may do on it, to hide the rest. */
  actions: z.array(z.enum(ISSUE_ACTIONS)),
});

export type IssueResponse = z.infer<typeof issueResponseSchema>;

/**
 * Body of `GET /api/v1/projects/:projectKey/issue-fields`: the short lists the forms offer. Each
 * status says which may follow it in the project's workflow.
 */
export const issueFieldsResponseSchema = z.object({
  /** In the workflow's order. */
  statuses: z.array(issueStatusSchema.extend({ isInitial: z.boolean(), next: z.array(z.uuid()) })),
  categories: z.array(issueCategorySchema.extend({ isDefault: z.boolean() })),
  /** Lowest first. */
  priorities: z.array(issuePrioritySchema.extend({ isDefault: z.boolean() })),
  /** Every label of the instance, by name. */
  labels: z.array(labelRefSchema),
  /** The properties of the project: the instance's it keeps, then its own, oldest first. */
  properties: z.array(issuePropertyFieldSchema),
  /** Whether the project hides the category and the priority, or asks them without default. */
  fieldSettings: projectFieldsSchema,
});

export type IssueFieldsResponse = z.infer<typeof issueFieldsResponseSchema>;

/** People an issue can be assigned to: active members who reach its project. */
export const assigneesResponseSchema = z.object({
  people: z.array(z.object({ id: z.uuid(), name: z.string(), email: z.string() })),
});

export type AssigneesResponse = z.infer<typeof assigneesResponseSchema>;
