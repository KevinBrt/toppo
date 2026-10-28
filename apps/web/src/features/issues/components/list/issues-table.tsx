import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { IssueGrouping, IssueSort, IssueSummary, SortOrder } from '@toppo-tracker/shared';
import { Alert, Badge, cn } from '@toppo-tracker/ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { type ReactNode, useSyncExternalStore } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { formatRelativeTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { SORT_LABELS } from '../../constants/issue-list.constants.ts';
import type { IssueSelection } from '../../models/bulk-change.model.ts';
import type { HideableField, IssueSection } from '../../models/issue-list.model.ts';
import { sectionsOf } from '../../utils/issue-groups.util.ts';
import { SelectCheckbox } from '../bulk/select-checkbox.tsx';
import { LabelChips } from '../fields/label-chips.tsx';
import { PersonName } from '../fields/person-name.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { StatusLabel } from '../fields/status-label.tsx';
import { PropertyChips } from '../properties/property-chips.tsx';
import { GroupTitle } from './group-title.tsx';
import { IssueCards } from './issue-cards.tsx';

/** What the list says when the server refuses its filters: one on a property no longer there. */
const LIST_ERRORS = {
  INVALID_PROPERTY_FILTER: 'issues.list.invalidFilter',
  PROPERTY_NOT_FOUND: 'issues.list.invalidFilter',
} as const;

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

/** The widths from which a column may show, as Tailwind's breakpoints, narrowest first. */
const BREAKPOINTS = [
  { breakpoint: 'md', query: '(min-width: 48rem)', className: 'hidden md:table-cell' },
  { breakpoint: 'xl', query: '(min-width: 80rem)', className: 'hidden xl:table-cell' },
  { breakpoint: '2xl', query: '(min-width: 96rem)', className: 'hidden 2xl:table-cell' },
] as const;

type Breakpoint = (typeof BREAKPOINTS)[number]['breakpoint'];

/** A column of the table: what heads it, what sorts by it, from which width it shows. */
interface Column<Issue> {
  header: string;
  /** What heads it instead of its header, which then only names it. */
  head?: ReactNode;
  sort?: IssueSort | undefined;
  width: string;
  /** Shown from this width on; at any width without it. */
  from?: Breakpoint;
  /** The field a project may hide, gone with it. */
  field?: HideableField;
  cell: (issue: Issue) => ReactNode;
}

/**
 * One page of issues, each opening its issue, with the way to the other pages: a table, and cards
 * on phones. Columns give way as the screen narrows, so that the subject keeps room beside the
 * sidebar; their headers sort the list when it says how. Grouped, each group comes under its
 * title. With a selection, a box ticks each issue, and one every issue of the page.
 */
export function IssuesTable<Issue extends IssueSummary>({
  issues,
  empty,
  last,
  grouping,
  sorting,
  hidden = [],
  selection,
  onPage,
}: {
  issues: UseQueryResult<IssuesPage<Issue>>;
  /** Shown when no issue matches. */
  empty: ReactNode;
  last: LastColumn<Issue>;
  grouping?: IssueGrouping | undefined;
  sorting?: TableSorting | undefined;
  /** The fields the project hides. */
  hidden?: readonly HideableField[];
  selection?: IssueSelection | undefined;
  onPage: (page: number) => void;
}) {
  const { t, locale } = useI18n();
  const reached = useReachedBreakpoints();

  if (issues.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('issues.loading')}
      </p>
    );
  }
  if (issues.isError) {
    return <Alert tone="danger">{requestErrorMessage(issues.error, t, LIST_ERRORS)}</Alert>;
  }
  const { rows, matching, page, pageSize, groups } = issues.data;
  if (matching === 0) {
    return empty;
  }
  const sections = sectionsOf(rows, grouping);
  // Across every page: the server counts each group whole.
  const sizeOf = (section: IssueSection<Issue>) =>
    groups?.find(({ key }) => key === section.key)?.count ?? section.issues.length;
  const pageBox = selection ? (
    <PageCheckbox keys={rows.map(({ key }) => key)} selection={selection} />
  ) : null;
  const allColumns: Column<Issue>[] = [
    ...(selection
      ? [
          {
            header: t('issues.bulk.selectPage'),
            head: pageBox,
            width: 'w-11',
            cell: (issue: Issue) => (
              <SelectCheckbox
                label={t('issues.bulk.select', { key: issue.key })}
                checked={selection.selected.includes(issue.key)}
                onChange={(checked) => selection.onSelect([issue.key], checked)}
              />
            ),
          },
        ]
      : []),
    {
      header: t(SORT_LABELS.key),
      sort: 'key',
      width: 'w-24',
      cell: (issue) => (
        <span className="font-mono text-xs font-medium text-muted-foreground">{issue.key}</span>
      ),
    },
    {
      header: t(SORT_LABELS.title),
      sort: 'title',
      width: '',
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
      width: 'w-40',
      from: '2xl',
      cell: (issue) => <PersonName person={issue.reporter} withAvatar={false} />,
    },
    {
      header: t(SORT_LABELS.category),
      sort: 'category',
      width: 'w-36',
      from: '2xl',
      field: 'category',
      cell: (issue) => (
        <Badge tone={issue.category.color} className="max-w-full">
          <span className="truncate">{issue.category.name}</span>
        </Badge>
      ),
    },
    {
      header: t(SORT_LABELS.priority),
      sort: 'priority',
      width: 'w-32',
      from: 'md',
      field: 'priority',
      cell: (issue) => <PriorityLabel priority={issue.priority} />,
    },
    {
      header: t(SORT_LABELS.status),
      sort: 'status',
      width: 'w-36',
      cell: (issue) => <StatusLabel status={issue.status} />,
    },
    {
      header: t(SORT_LABELS.updated),
      sort: 'updated',
      width: 'w-28',
      from: 'xl',
      cell: (issue) => (
        <time dateTime={issue.updatedAt} className="text-muted-foreground">
          {formatRelativeTime(issue.updatedAt, locale)}
        </time>
      ),
    },
    {
      header: last.header,
      sort: last.sort,
      width: 'w-44',
      from: 'xl',
      cell: last.cell,
    },
  ];
  const columns = allColumns.filter(({ field }) => !(field && hidden.includes(field)));
  // A group's title spans exactly the columns shown: spanning more would add empty columns,
  // which take their room from the subject.
  const shownColumns = columns.filter(({ from }) => !from || reached.includes(from)).length;
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
                    <td
                      key={column.header}
                      className={cn(classNameOf(column), CELL_PADDING, 'py-3')}
                    >
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
        {pageBox ? (
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm text-muted-foreground">
            {pageBox}
            <span aria-hidden="true">{t('issues.bulk.selectPage')}</span>
          </div>
        ) : null}
        <IssueCards
          sections={sections}
          grouping={grouping}
          sizeOf={sizeOf}
          last={last}
          showsPriority={!hidden.includes('priority')}
          selection={selection}
        />
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

/** A column's width, and its `hidden md:table-cell` when it shows only from a width on. */
function classNameOf<Issue>({ width, from }: Column<Issue>): string {
  return cn(width, BREAKPOINTS.find(({ breakpoint }) => breakpoint === from)?.className);
}

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
  const className = cn(classNameOf(column), CELL_PADDING, 'py-2.5 font-medium');
  if (column.head) {
    return (
      <th scope="col" className={className}>
        {column.head}
      </th>
    );
  }
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

/** Ticks every issue of the page, or none; half ticked when only some are. */
function PageCheckbox({ keys, selection }: { keys: readonly string[]; selection: IssueSelection }) {
  const { t } = useI18n();
  const ticked = keys.filter((key) => selection.selected.includes(key)).length;

  return (
    <SelectCheckbox
      label={t('issues.bulk.selectPage')}
      checked={ticked > 0 && ticked === keys.length}
      indeterminate={ticked > 0 && ticked < keys.length}
      onChange={(checked) => selection.onSelect(keys, checked)}
    />
  );
}

function subscribeToWidths(onChange: () => void): () => void {
  const lists = BREAKPOINTS.map(({ query }) => window.matchMedia(query));
  for (const list of lists) {
    list.addEventListener('change', onChange);
  }
  return () => {
    for (const list of lists) {
      list.removeEventListener('change', onChange);
    }
  };
}

/** How many breakpoints the screen reaches, narrowest first: a number, stable between renders. */
const reachedCount = () =>
  BREAKPOINTS.filter(({ query }) => window.matchMedia(query).matches).length;

/** The breakpoints the screen reaches at its current width. */
function useReachedBreakpoints(): readonly Breakpoint[] {
  const count = useSyncExternalStore(subscribeToWidths, reachedCount);
  return BREAKPOINTS.slice(0, count).map(({ breakpoint }) => breakpoint);
}
