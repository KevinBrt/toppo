import {
  ISSUE_SORT_ORDERS,
  type IssueSort,
  type ProjectFields,
  type ProjectIssuesQuery,
  type SortOrder,
} from '@toppo/shared';
import { z } from 'zod';
import {
  HIDEABLE_FIELDS,
  type HideableField,
  ISSUE_LIST_FILTERS,
  type IssueListFilter,
  type IssueListSearch,
  type IssueListState,
} from '../models/issue-list.model.ts';

/** Words a filter accepts besides ids: the caller, or no one. */
const WORDS: Readonly<Record<IssueListFilter, readonly string[]>> = {
  status: [],
  priority: [],
  category: [],
  label: [],
  assignee: ['me', 'none'],
  reporter: ['me'],
};

/** As many values as the server takes in one filter. */
const VALUES_MAX = 50;

const idSchema = z.uuid();

/** The values of a filter in the address that make sense, each once; none as `undefined`. */
function valuesIn(text: string | undefined, filter: IssueListFilter): string[] | undefined {
  const values = (text ?? '')
    .split(',')
    .filter((value) => WORDS[filter].includes(value) || idSchema.safeParse(value).success);
  const unique = [...new Set(values)].slice(0, VALUES_MAX);
  return unique.length > 0 ? unique : undefined;
}

/** The fields a project hides, once its settings are known. */
export function hiddenFieldsOf(settings: ProjectFields | undefined): HideableField[] {
  return HIDEABLE_FIELDS.filter((field) => settings?.[field].hidden);
}

/** Whether a filter, sort or grouping is about none of the fields hidden. */
export function isShownWith(hidden: readonly HideableField[]): (value: string) => boolean {
  return (value) => !hidden.some((field) => field === value);
}

/** What to ask the server for, from what the address keeps: open issues by default. */
export function issuesQueryOf(search: IssueListSearch): ProjectIssuesQuery {
  const state = search.state ?? 'open';
  return {
    page: search.page,
    search: search.q || undefined,
    state: state === 'all' ? undefined : state,
    status: valuesIn(search.status, 'status'),
    priority: valuesIn(search.priority, 'priority'),
    category: valuesIn(search.category, 'category'),
    label: valuesIn(search.label, 'label'),
    assignee: valuesIn(search.assignee, 'assignee'),
    reporter: valuesIn(search.reporter, 'reporter'),
    sort: search.sort,
    order: search.order,
    group: search.group,
  };
}

/** What the address keeps of a query: only what differs from the default list. */
export function searchOf(query: ProjectIssuesQuery): Omit<IssueListSearch, 'project'> {
  const joined = (values: readonly string[] | undefined) =>
    values && values.length > 0 ? values.join(',') : undefined;
  const state = stateOf(query);
  return {
    page: query.page && query.page > 1 ? query.page : undefined,
    q: query.search || undefined,
    state: state === 'open' ? undefined : state,
    status: joined(query.status),
    priority: joined(query.priority),
    category: joined(query.category),
    label: joined(query.label),
    assignee: joined(query.assignee),
    reporter: joined(query.reporter),
    sort: query.sort === 'key' ? undefined : query.sort,
    order: query.order === ISSUE_SORT_ORDERS[sortOf(query)] ? undefined : query.order,
    group: query.group,
  };
}

/** What a query sorts by: the key, newest first, unless it says otherwise. */
export function sortOf(query: ProjectIssuesQuery): IssueSort {
  return query.sort ?? 'key';
}

/** The order a query sorts in: its sort's own unless it says otherwise. */
export function orderOf(query: ProjectIssuesQuery): SortOrder {
  return query.order ?? ISSUE_SORT_ORDERS[sortOf(query)];
}

/**
 * The query sorted by `sort`: in that sort's own order the first time, the other way round when
 * already sorted by it, as a column's header does.
 */
export function sortedBy(query: ProjectIssuesQuery, sort: IssueSort): ProjectIssuesQuery {
  const flipped = orderOf(query) === 'asc' ? 'desc' : 'asc';
  return sortedAs(query, sort, sortOf(query) === sort ? flipped : ISSUE_SORT_ORDERS[sort]);
}

/** The query sorted by `sort` in `order`, which it names only when not the sort's own. */
export function sortedAs(
  query: ProjectIssuesQuery,
  sort: IssueSort,
  order: SortOrder,
): ProjectIssuesQuery {
  return firstPageOf(query, {
    sort,
    order: order === ISSUE_SORT_ORDERS[sort] ? undefined : order,
  });
}

/** Which issues a query shows by their state: no state asked means all of them. */
export function stateOf(query: ProjectIssuesQuery): IssueListState {
  return query.state ?? 'all';
}

/** Whether a query narrows the default list: open issues, unsearched, unfiltered. */
export function isNarrowed(query: ProjectIssuesQuery): boolean {
  return (
    Boolean(query.search) ||
    stateOf(query) !== 'open' ||
    ISSUE_LIST_FILTERS.some((filter) => (query[filter]?.length ?? 0) > 0)
  );
}

/** The same query back to the default list, keeping how it is sorted and grouped. */
export function withoutFilters(query: ProjectIssuesQuery): ProjectIssuesQuery {
  return { state: 'open', sort: query.sort, order: query.order, group: query.group };
}

/** A query showing its first page again, after a filter, the sort or the grouping changed. */
export function firstPageOf(
  query: ProjectIssuesQuery,
  change: Partial<ProjectIssuesQuery>,
): ProjectIssuesQuery {
  return { ...query, ...change, page: undefined };
}
