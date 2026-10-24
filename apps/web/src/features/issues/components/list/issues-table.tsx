import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { IssueGrouping, IssueSort, IssueSummary, SortOrder } from '@toppo/shared';
import { Alert, Badge, cn } from '@toppo/ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { formatRelativeTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { SORT_LABELS } from '../../constants/issue-list.constants.ts';
import type { IssueSection } from '../../models/issue-list.model.ts';
import { sectionsOf } from '../../utils/issue-groups.util.ts';
import { LabelChips } from '../fields/label-chips.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { PropertyChips } from '../fields/property-chips.tsx';
import { StatusLabel } from '../fields/status-label.tsx';
import { GroupTitle } from './group-title.tsx';
import { IssueCards } from './issue-cards.tsx';

/** One page of issues as the server answers it, with the size of every group when grouped. */
interface IssuesPage<Issue> {
  rows: Issue[];
  matching: number;
  page: number;
  pageSize: number;
  groups?: readonly { key: string | null; count: number }[] | null;
}

/** The column a list ends with: who an issue goes to, or the project it belongs to. */
export interface LastColumn<Issue> {
  header: string;
  /** What sorts the list by this column, when the server can. */
  sort?: IssueSort;
  cell: (issue: Issue) => ReactNode;
}

/** How the list is sorted, for a list its headers sort. */
export interface TableSorting {
  sort: IssueSort;
  order: SortOrder;
  onSort: (sort: IssueSort) => void;
}

/** A column of the table: what heads it, what sorts by it, from which width it shows. */
interface Column<Issue> {
  header: string;
  sort?: IssueSort | undefined;
  /** Its width, and its `hidden md:table-cell` when it shows only from a width on. */
  className: string;
  cell: (issue: Issue) => ReactNode;
}

/**
 * One page of issues, each opening its issue, with the way to the other pages: a table, and cards
 * on phones. Columns give way as the screen narrows, so that the subject keeps room beside the
 * sidebar; their headers sort the list when it says how. Grouped, each group comes under its
 * title.
 */
export function IssuesTable<Issue extends IssueSummary>({
  issues,
  empty,
  last,
  grouping,
  sorting,
  onPage,
}: {
  issues: UseQueryResult<IssuesPage<Issue>>;
  /** Shown when no issue matches. */
  empty: ReactNode;
  last: LastColumn<Issue>;
  grouping?: IssueGrouping | undefined;
  sorting?: TableSorting | undefined;
  onPage: (page: number) => void;
}) {
  const { t, locale } = useI18n();
  const shownColumns = useShownColumns();

  if (issues.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('issues.loading')}
      </p>
    );
  }
  if (issues.isError) {
    return <Alert tone="danger">{requestErrorMessage(issues.error, t)}</Alert>;
  }
  const { rows, matching, page, pageSize, groups } = issues.data;
  if (matching === 0) {
    return empty;
  }
  const sections = sectionsOf(rows, grouping);
  // Across every page: the server counts each group whole.
  const sizeOf = (section: IssueSection<Issue>) =>
    groups?.find(({ key }) => key === section.key)?.count ?? section.issues.length;
  const columns: Column<Issue>[] = [
    {
      header: t(SORT_LABELS.key),
      sort: 'key',
      className: 'w-24',
      cell: (issue) => (
        <span className="font-mono text-xs font-medium text-muted-foreground">{issue.key}</span>
      ),
    },
    {
      header: t(SORT_LABELS.title),
      sort: 'title',
      className: '',
      cell: (issue) => (
        <span className="flex min-w-0 items-center gap-2">
          <Link
            to="/issues/$issueKey"
            params={{ issueKey: issue.key }}
            className="line-clamp-1 min-w-0 font-medium break-words text-foreground outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
          >
            {issue.title}
          </Link>
          {/* Beside the subject while there is room for both. */}
          <PropertyChips
            values={issue.properties}
            className="hidden max-w-[40%] shrink-0 flex-nowrap overflow-hidden md:flex"
          />
          <LabelChips
            labels={issue.labels}
            max={2}
            className="hidden shrink-0 flex-nowrap lg:flex"
          />
        </span>
      ),
    },
    {
      header: t(SORT_LABELS.reporter),
      sort: 'reporter',
      className: 'hidden w-40 2xl:table-cell',
      cell: (issue) => <PersonName person={issue.reporter} withAvatar={false} />,
    },
    {
      header: t(SORT_LABELS.category),
      sort: 'category',
      className: 'hidden w-36 2xl:table-cell',
      cell: (issue) => (
        <Badge tone={issue.category.color} className="max-w-full">
          <span className="truncate">{issue.category.name}</span>
        </Badge>
      ),
    },
    {
      header: t(SORT_LABELS.priority),
      sort: 'priority',
      className: 'hidden w-32 md:table-cell',
      cell: (issue) => <PriorityLabel priority={issue.priority} />,
    },
    {
      header: t(SORT_LABELS.status),
      sort: 'status',
      className: 'w-36',
      cell: (issue) => <StatusLabel status={issue.status} />,
    },
    {
      header: t(SORT_LABELS.updated),
      sort: 'updated',
      className: 'hidden w-28 xl:table-cell',
      cell: (issue) => (
        <time dateTime={issue.updatedAt} className="text-muted-foreground">
          {formatRelativeTime(issue.updatedAt, locale)}
        </time>
      ),
    },
    {
      header: last.header,
      sort: last.sort,
      className: 'hidden w-44 xl:table-cell',
      cell: last.cell,
    },
  ];
  return (
    <section
      aria-busy={issues.isPlaceholderData}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      <table className="hidden w-full table-fixed text-sm sm:table">
        <thead className="border-b border-border text-left text-xs text-muted-foreground">
          <tr>
            {columns.map((column) => (
              <ColumnHeader key={column.header} column={column} sorting={sorting} />
            ))}
          </tr>
        </thead>
        {sections.map((section) => {
          const [first] = section.issues;
          return (
            <tbody
              key={section.key ?? 'none'}
              className="divide-y divide-border border-t border-border first-of-type:border-t-0"
            >
              {grouping && first ? (
                <tr className="bg-surface-muted">
                  <th
                    scope="rowgroup"
                    colSpan={shownColumns}
                    className="px-4 py-2 text-left text-xs font-medium text-foreground"
                  >
                    <GroupTitle grouping={grouping} issue={first} size={sizeOf(section)} />
                  </th>
                </tr>
              ) : null}
              {section.issues.map((issue) => (
                // Only the background eases: a row moving up gets its line at once, not fading
                // from the text color.
                <tr
                  key={issue.key}
                  className="relative transition-[background-color] hover:bg-surface-hover"
                >
                  {columns.map((column) => (
                    <td key={column.header} className={cn(column.className, CELL_PADDING, 'py-3')}>
                      {column.cell(issue)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <div className="sm:hidden">
        <IssueCards sections={sections} grouping={grouping} sizeOf={sizeOf} last={last} />
      </div>
      <Pager
        page={page}
        pageSize={pageSize}
        matching={matching}
        shown={rows.length}
        label={(count) => t(`issues.shown.${pluralForm(locale, count)}`, { count })}
        onPage={onPage}
      />
    </section>
  );
}

/** Room between columns, and more at both ends of a row. */
const CELL_PADDING = 'px-2 first:pl-4 last:pr-4';

/**
 * A column's header: a button sorting the list by it when the list is sortable and the server
 * can, its arrow saying in which order.
 */
function ColumnHeader<Issue>({
  column,
  sorting,
}: {
  column: Column<Issue>;
  sorting: TableSorting | undefined;
}) {
  const sort = column.sort;
  const className = cn(column.className, CELL_PADDING, 'py-2.5 font-medium');
  if (!(sorting && sort)) {
    return (
      <th scope="col" className={className}>
        {column.header}
      </th>
    );
  }
  const sorted = sorting.sort === sort;
  const ArrowIcon = sorting.order === 'asc' ? ArrowUpIcon : ArrowDownIcon;
  const Icon = sorted ? ArrowIcon : ChevronsUpDownIcon;
  const ariaSort = sorting.order === 'asc' ? 'ascending' : 'descending';
  return (
    <th scope="col" aria-sort={sorted ? ariaSort : undefined} className={className}>
      <button
        type="button"
        onClick={() => sorting.onSort(sort)}
        className={cn(
          'group -mx-1 inline-flex max-w-full items-center gap-1 rounded-sm px-1 text-left outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11',
          sorted && 'text-foreground',
        )}
      >
        <span className="truncate">{column.header}</span>
        <Icon
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0',
            !sorted && 'opacity-40 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        />
      </button>
    </th>
  );
}

/** The columns always shown: the key, the subject and the status. */
const BASE_COLUMNS = 3;

/**
 * The columns that join from a width on, as their `md:`, `xl:` and `2xl:` classes show them
 * (Tailwind's breakpoints): the priority, then the last change and the last column, then the
 * requester and the category.
 */
const WIDER_COLUMNS = [
  { query: '(min-width: 48rem)', count: 1 },
  { query: '(min-width: 80rem)', count: 2 },
  { query: '(min-width: 96rem)', count: 2 },
] as const;

function subscribeToWidths(onChange: () => void): () => void {
  const lists = WIDER_COLUMNS.map(({ query }) => window.matchMedia(query));
  for (const list of lists) {
    list.addEventListener('change', onChange);
  }
  return () => {
    for (const list of lists) {
      list.removeEventListener('change', onChange);
    }
  };
}

/**
 * How many columns the table shows at the current width. A group's title spans exactly them:
 * spanning more would add empty columns, which take their room from the subject.
 */
function useShownColumns(): number {
  return useSyncExternalStore(subscribeToWidths, () =>
    WIDER_COLUMNS.reduce(
      (count, { query, count: joining }) =>
        window.matchMedia(query).matches ? count + joining : count,
      BASE_COLUMNS,
    ),
  );
}
