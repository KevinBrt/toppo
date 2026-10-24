import { effectiveWorkflow, issueReferencesIn, issueVisibilityOf } from '@toppo/core';
import { type Db, type SimilarWords, schema, similarWords } from '@toppo/db';
import {
  ISSUE_SORT_ORDERS,
  ISSUES_PAGE_SIZE,
  type IssueGrouping,
  type IssueSort,
  type IssueState,
  type IssuesResponse,
  type ProjectIssuesQuery,
  projectIssuesParamsSchema,
  projectIssuesQuerySchema,
  type SortOrder,
} from '@toppo/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { labelsOfIssue, propertyValuesOfIssue, toIssueSummary } from '../utils/issue-rows.util.ts';
import { textMatching } from '../utils/issue-search.util.ts';
import { propertyFiltersOf } from '../utils/property-filters.util.ts';

const {
  issueCategories,
  issueLabels,
  issues,
  priorities,
  statuses,
  users,
  workflowStatuses,
  workflows,
} = schema;
const assignees = alias(users, 'assignees');
const reporters = alias(users, 'reporters');

/** What each sort orders issues by: categories and statuses as the administrators ordered them. */
const SORT_COLUMNS: Readonly<Record<IssueSort, SQLWrapper>> = {
  key: issues.number,
  title: sql`lower(${issues.title})`,
  reporter: reporters.name,
  category: issueCategories.position,
  priority: priorities.level,
  status: workflowStatuses.position,
  assignee: assignees.name,
  updated: issues.updatedAt,
};

/**
 * Issues in `order` of their `sort` column, then the newest first, so that pages never overlap.
 * Only an assignee may be missing: issues assigned to no one come last either way. The other
 * columns keep PostgreSQL's own order, the one their indexes can be read in.
 *
 * Searched, the list is never read in the order of the numbers' index: PostgreSQL cannot tell
 * how rare a word typed in part is, and reading the index until a page is full would go through
 * a whole project for a word found a few times, or not at all. Sorting on `number + 0`, which
 * no index holds, makes it gather the matches through the search indexes first
 * (docs/performance.md).
 */
function sortedBy(sort: IssueSort, order: SortOrder, searched: boolean): SQL[] {
  const column = sort === 'key' && searched ? sql`${issues.number} + 0` : SORT_COLUMNS[sort];
  const ordered = order === 'asc' ? asc(column) : desc(column);
  if (sort === 'key') {
    return [ordered];
  }
  return [sort === 'assignee' ? sql`${ordered} nulls last` : ordered, desc(issues.number)];
}

/** What groups issues, the order of the groups, and the columns that order needs. */
const GROUPINGS: Readonly<
  Record<IssueGrouping, { key: PgColumn; order: SQL[]; columns: PgColumn[] }>
> = {
  // In the order of the workflow the project follows.
  status: {
    key: issues.statusId,
    order: [asc(workflowStatuses.position), asc(issues.statusId)],
    columns: [issues.statusId, workflowStatuses.position],
  },
  // The most urgent first.
  priority: {
    key: issues.priorityId,
    order: [desc(priorities.level), asc(issues.priorityId)],
    columns: [issues.priorityId, priorities.level],
  },
  // By name, those assigned to no one last.
  assignee: {
    key: issues.assigneeId,
    order: [sql`${assignees.name} asc nulls last`, asc(issues.assigneeId)],
    columns: [issues.assigneeId, assignees.name],
  },
};

/**
 * One page of a project's issues, searched, filtered (by its properties too), sorted and maybe
 * grouped, all in the query: every issue, or only those the caller reported when that is all they
 * may see. Grouped, the page comes with the size of every group.
 */
export const listIssues = defineQuery({
  name: 'issue.list',
  access: { project: 'projectKey' },
  input: projectIssuesParamsSchema.extend(projectIssuesQuerySchema.shape),
  async handler({ db, actor, project }, query): Promise<IssuesResponse> {
    const visibility = issueVisibilityOf(project.permissions);
    const matching = and(
      eq(issues.projectId, project.id),
      visibility === 'own' ? eq(issues.reporterId, actor.id) : undefined,
      visibility === 'none' ? sql`false` : undefined,
      ...filtersOf(query, actor.id),
      ...(await propertyFiltersOf(db, project.id, query.property, actor.id)),
      query.search
        ? searched(query.search, project.key, await similarWords(db, query.search))
        : undefined,
    );
    // Where each issue's status stands in the workflow the project follows.
    const step = and(
      eq(workflowStatuses.workflowId, await followedWorkflowId(db, project.id)),
      eq(workflowStatuses.statusId, issues.statusId),
    );
    const grouping = query.group ? GROUPINGS[query.group] : null;

    // The page first, its issues alone: an offset reads every issue before it, and the labels
    // and properties of each are worked out only for those shown (docs/performance.md).
    const page = await db
      .select({ id: issues.id })
      .from(issues)
      .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
      .innerJoin(priorities, eq(priorities.id, issues.priorityId))
      .innerJoin(reporters, eq(reporters.id, issues.reporterId))
      .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
      .leftJoin(workflowStatuses, step)
      .where(matching)
      .orderBy(
        ...(grouping?.order ?? []),
        ...sortedBy(
          query.sort,
          query.order ?? ISSUE_SORT_ORDERS[query.sort],
          Boolean(query.search),
        ),
      )
      .limit(ISSUES_PAGE_SIZE)
      .offset((query.page - 1) * ISSUES_PAGE_SIZE);
    const ids = page.map(({ id }) => id);
    const found = new Map(
      (ids.length === 0 ? [] : await rowsOf(db, ids)).map((row) => [row.id, row]),
    );
    const rows = ids.flatMap((id) => found.get(id) ?? []);
    const [total] = await db.select({ count: count() }).from(issues).where(matching);
    const groups = grouping
      ? await db
          .select({ key: sql<string | null>`${grouping.key}`, count: count() })
          .from(issues)
          .innerJoin(priorities, eq(priorities.id, issues.priorityId))
          .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
          .leftJoin(workflowStatuses, step)
          .where(matching)
          .groupBy(...grouping.columns)
          .orderBy(...grouping.order)
      : null;

    return {
      rows: rows.map((row) => toIssueSummary(project.key, row)),
      matching: total?.count ?? 0,
      page: query.page,
      pageSize: ISSUES_PAGE_SIZE,
      groups,
    };
  },
});

/** The issues of a page, with what the list shows of each, in no particular order. */
function rowsOf(db: Db, ids: readonly string[]) {
  return db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      status: {
        id: statuses.id,
        name: statuses.name,
        color: statuses.color,
        closes: statuses.closes,
      },
      category: {
        id: issueCategories.id,
        name: issueCategories.name,
        color: issueCategories.color,
      },
      priority: { id: priorities.id, name: priorities.name, level: priorities.level },
      assignee: { id: assignees.id, name: assignees.name, deletedAt: assignees.deletedAt },
      reporter: { id: reporters.id, name: reporters.name, deletedAt: reporters.deletedAt },
      labels: labelsOfIssue,
      properties: propertyValuesOfIssue({ listedOnly: true }),
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    })
    .from(issues)
    .innerJoin(statuses, eq(statuses.id, issues.statusId))
    .innerJoin(issueCategories, eq(issueCategories.id, issues.categoryId))
    .innerJoin(priorities, eq(priorities.id, issues.priorityId))
    .innerJoin(reporters, eq(reporters.id, issues.reporterId))
    .leftJoin(assignees, eq(assignees.id, issues.assigneeId))
    .where(inArray(issues.id, [...ids]));
}

/** The conditions the filters set, `me` standing for the caller. */
function filtersOf(query: ProjectIssuesQuery, actorId: string): (SQL | undefined)[] {
  const people = (values: readonly string[] = []) =>
    values.map((value) => (value === 'me' ? actorId : value));
  return [
    stateOf(query.state),
    anyOf(issues.statusId, query.status),
    anyOf(issues.priorityId, query.priority),
    anyOf(issues.categoryId, query.category),
    taggedWith(query.label),
    assignedTo(people(query.assignee)),
    anyOf(issues.reporterId, people(query.reporter)),
  ];
}

/** Issues with any of these labels, each checked in the index of its labels. */
function taggedWith(labelIds: readonly string[] | undefined): SQL | undefined {
  if (!labelIds?.length) {
    return undefined;
  }
  return sql`exists (select 1 from ${issueLabels}
    where ${issueLabels.issueId} = ${issues.id}
      and ${inArray(issueLabels.labelId, [...labelIds])})`;
}

/**
 * Issues a search finds by their text, a typo corrected, and those it names in this project:
 * `WEB-42` however written, or `42`.
 */
function searched(search: string, projectKey: string, similar: SimilarWords): SQL | undefined {
  const numbers = issueReferencesIn(search)
    .filter((reference) => (reference.projectKey ?? projectKey) === projectKey)
    .map(({ number }) => number);
  return or(
    textMatching(search, similar),
    numbers.length > 0 ? inArray(issues.number, numbers) : undefined,
  );
}

/** Issues whose `column` is one of `values`; no condition when there are none. */
function anyOf(column: PgColumn, values: readonly string[] = []): SQL | undefined {
  return values.length > 0 ? inArray(column, values) : undefined;
}

function stateOf(state: IssueState | undefined): SQL | undefined {
  if (state === 'open') {
    return isNull(issues.closedAt);
  }
  return state === 'closed' ? isNotNull(issues.closedAt) : undefined;
}

/** Issues assigned to one of `people`, or to no one when they include `none`. */
function assignedTo(people: readonly string[]): SQL | undefined {
  return or(
    people.includes('none') ? isNull(issues.assigneeId) : undefined,
    anyOf(
      issues.assigneeId,
      people.filter((person) => person !== 'none'),
    ),
  );
}

/** The workflow a project's issues follow: its own copy, else the instance's. */
async function followedWorkflowId(db: Db, projectId: string): Promise<string> {
  const candidates = await db
    .select({ id: workflows.id, projectId: workflows.projectId })
    .from(workflows)
    .where(or(isNull(workflows.projectId), eq(workflows.projectId, projectId)));
  return effectiveWorkflow(candidates, projectId).id;
}
