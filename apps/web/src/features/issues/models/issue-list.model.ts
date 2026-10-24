import { ISSUE_GROUPINGS, ISSUE_SORTS, SORT_ORDERS } from '@toppo/shared';
import { z } from 'zod';

/** A list of ids joined by commas, as the address keeps it: read item by item later. */
const listInAddress = z.string().max(2000).optional().catch(undefined);

/**
 * What a project's list shows, kept in the address: shareable, and kept by back and forward.
 * Open issues unless `state` says otherwise; values that make no sense are dropped.
 */
export const issueListSearchSchema = z.object({
  project: z.string().trim().max(10).optional().catch(undefined),
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  q: z.string().trim().max(100).optional().catch(undefined),
  state: z.enum(['closed', 'all']).optional().catch(undefined),
  status: listInAddress,
  priority: listInAddress,
  category: listInAddress,
  label: listInAddress,
  assignee: listInAddress,
  reporter: listInAddress,
  /** Filters on the project's properties: `<id>:<a>,<b>;<id>:<from>..<to>`. */
  property: z.string().max(4000).optional().catch(undefined),
  sort: z.enum(ISSUE_SORTS).optional().catch(undefined),
  order: z.enum(SORT_ORDERS).optional().catch(undefined),
  group: z.enum(ISSUE_GROUPINGS).optional().catch(undefined),
});

export type IssueListSearch = z.infer<typeof issueListSearchSchema>;

/** The issues a list shows by their state: open ones by default. */
export const ISSUE_LIST_STATES = ['open', 'closed', 'all'] as const;

export type IssueListState = (typeof ISSUE_LIST_STATES)[number];

/** The filters that take several values, each joined by commas in the address. */
export const ISSUE_LIST_FILTERS = [
  'status',
  'priority',
  'category',
  'label',
  'assignee',
  'reporter',
] as const;

export type IssueListFilter = (typeof ISSUE_LIST_FILTERS)[number];

/** The fields a project may hide: its lists then neither show, filter, sort nor group by them. */
export const HIDEABLE_FIELDS = ['priority', 'category'] as const;

export type HideableField = (typeof HIDEABLE_FIELDS)[number];

/** The issues of a page that share a group, in the order the server sent them. */
export interface IssueSection<Issue> {
  /** The status, priority or assignee's id; null for no one, and for a list not grouped. */
  key: string | null;
  issues: Issue[];
}
