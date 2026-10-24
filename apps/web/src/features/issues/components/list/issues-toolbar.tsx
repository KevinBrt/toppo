import { useQuery } from '@tanstack/react-query';
import { ISSUE_GROUPINGS, ISSUE_SORTS, type ProjectIssuesQuery } from '@toppo/shared';
import { Badge, Button, Input } from '@toppo/ui';
import { LayersIcon, SearchIcon, XIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useState } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import {
  type HideableField,
  ISSUE_LIST_STATES,
  type IssueListFilter,
} from '../../models/issue-list.model.ts';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import {
  firstPageOf,
  isNarrowed,
  isShownWith,
  orderOf,
  sortedAs,
  sortOf,
  stateOf,
  withoutFilters,
  withPropertyFilter,
} from '../../utils/issue-list.util.ts';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { StatusLabel } from '../fields/status-label.tsx';
import { ChoiceMenu } from './choice-menu.tsx';
import { FilterButton, FilterMenu, type FilterOption } from './filter-menu.tsx';
import { PropertyFilters } from './property-filters.tsx';
import { SortMenu } from './sort-menu.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/**
 * What a project's list shows: a search, then a menu per filter, its state first, those of its
 * properties, and the grouping. Phones also get the sort, which wider screens find in the column
 * headers. Every change starts again from the first page. A field the project hides is in none
 * of them.
 */
export function IssuesToolbar({
  projectKey,
  query,
  seesEveryIssue,
  canListPeople,
  hidden,
  onQueryChange,
}: {
  projectKey: string;
  query: ProjectIssuesQuery;
  /** Whoever sees only their own issues has no use for the requester filter. */
  seesEveryIssue: boolean;
  /** Whoever may assign issues gets the people of the project in the people filters. */
  canListPeople: boolean;
  hidden: readonly HideableField[];
  onQueryChange: (query: ProjectIssuesQuery) => void;
}) {
  const { t } = useI18n();
  const filters = useFilterOptions(projectKey, canListPeople);
  const isShown = isShownWith(hidden);
  const change = (next: Partial<ProjectIssuesQuery>) => onQueryChange(firstPageOf(query, next));
  const state = stateOf(query);
  const menus: { filter: IssueListFilter; label: string; shown: boolean }[] = [
    { filter: 'status', label: t('issues.status'), shown: true },
    { filter: 'priority', label: t('issues.priority'), shown: isShown('priority') },
    { filter: 'category', label: t('issues.category'), shown: isShown('category') },
    // Once the instance has labels, or while the address still filters by one.
    {
      filter: 'label',
      label: t('issues.labels'),
      shown: filters.options.label.length > 0 || Boolean(query.label?.length),
    },
    { filter: 'assignee', label: t('issues.assignee'), shown: true },
    { filter: 'reporter', label: t('issues.reporter'), shown: seesEveryIssue },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchBox
        search={query.search ?? ''}
        onSearch={(search) => change({ search: search || undefined })}
      />
      <fieldset className="contents">
        <legend className="sr-only">{t('issues.list.filters')}</legend>
        <ChoiceMenu
          trigger={
            <FilterButton active={state !== 'open'}>
              {t('issues.list.chosen', {
                label: t('issues.list.state'),
                value: t(`issues.list.${state}`),
              })}
            </FilterButton>
          }
          value={state}
          options={ISSUE_LIST_STATES.map((value) => ({
            value,
            label: t(`issues.list.${value}`),
          }))}
          onChange={(value) => change({ state: value === 'all' ? undefined : value })}
        />
        {menus
          .filter(({ shown }) => shown)
          .map(({ filter, label }) => (
            <FilterMenu
              key={filter}
              label={label}
              options={filters.options[filter]}
              loading={filters.loading[filter]}
              chosen={query[filter] ?? []}
              onChange={(chosen) => change({ [filter]: chosen.length > 0 ? chosen : undefined })}
            />
          ))}
        <PropertyFilters
          projectKey={projectKey}
          filters={query.property ?? []}
          canListPeople={canListPeople}
          onChange={(propertyId, filter) =>
            onQueryChange(withPropertyFilter(query, propertyId, filter))
          }
        />
      </fieldset>
      {isNarrowed(query) ? (
        <Button variant="ghost" size="sm" onClick={() => onQueryChange(withoutFilters(query))}>
          <XIcon aria-hidden="true" />
          {t('issues.list.clear')}
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap gap-1">
        <div className="sm:hidden">
          <SortMenu
            sorts={ISSUE_SORTS.filter(isShown)}
            sort={sortOf(query)}
            order={orderOf(query)}
            onChange={(sort, order) => onQueryChange(sortedAs(query, sort, order))}
          />
        </div>
        <ChoiceMenu
          trigger={
            <Button variant="ghost" size="sm">
              <LayersIcon aria-hidden="true" />
              {t('issues.list.group', {
                value: t(`issues.list.groupings.${query.group ?? 'none'}`),
              })}
            </Button>
          }
          value={query.group ?? 'none'}
          options={(['none', ...ISSUE_GROUPINGS.filter(isShown)] as const).map((group) => ({
            value: group,
            label: t(`issues.list.groupings.${group}`),
          }))}
          onChange={(group) => change({ group: group === 'none' ? undefined : group })}
        />
      </div>
    </div>
  );
}

/** The search box: follows the address, and reports what is typed once typing pauses. */
function SearchBox({ search, onSearch }: { search: string; onSearch: (search: string) => void }) {
  const { t } = useI18n();
  const [typed, setTyped] = useState(search);

  // Follows the address bar too: back and forward change the search.
  useEffect(() => setTyped(search), [search]);

  // The latest callback, without restarting the wait each time the toolbar renders.
  const report = useEffectEvent((text: string) => onSearch(text));

  useEffect(() => {
    if (typed.trim() === search) {
      return;
    }
    const timer = setTimeout(() => report(typed.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed, search]);

  return (
    <div className="relative w-full sm:w-64">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        aria-label={t('issues.list.search')}
        value={typed}
        maxLength={100}
        placeholder={t('issues.list.search')}
        onChange={(event) => setTyped(event.target.value)}
        className="pl-9"
      />
    </div>
  );
}

/** What each filter offers: the project's fields, and its people for whoever may list them. */
function useFilterOptions(projectKey: string, canListPeople: boolean) {
  const { t } = useI18n();
  const fields = useQuery(IssuesQueries.fields(projectKey));
  const people = useQuery({
    ...IssuesQueries.assignees(projectKey, ''),
    enabled: canListPeople,
  });
  const personOptions: FilterOption[] = (people.data ?? []).map(({ id, name }) => ({
    value: id,
    label: name,
    text: name,
  }));
  const me: FilterOption = { value: 'me', label: t('issues.list.me'), text: t('issues.list.me') };
  const options: Record<IssueListFilter, FilterOption[]> = {
    status: (fields.data?.statuses ?? []).map((status) => ({
      value: status.id,
      label: <StatusLabel status={status} />,
      text: status.name,
    })),
    // The most urgent first, as the list sorts them.
    priority: (fields.data?.priorities ?? [])
      .toSorted((left, right) => right.level - left.level)
      .map((priority) => ({
        value: priority.id,
        label: <PriorityLabel priority={priority} />,
        text: priority.name,
      })),
    category: (fields.data?.categories ?? []).map((category) => ({
      value: category.id,
      label: <Badge tone={category.color}>{category.name}</Badge>,
      text: category.name,
    })),
    label: (fields.data?.labels ?? []).map((label) => ({
      value: label.id,
      label: <Badge tone={label.color}>{label.name}</Badge>,
      text: label.name,
    })),
    assignee: [
      me,
      { value: 'none', label: t('issues.unassigned'), text: t('issues.unassigned') },
      ...personOptions,
    ],
    reporter: [me, ...personOptions],
  };
  const loadingPeople = canListPeople && people.isPending;
  const loading: Record<IssueListFilter, boolean> = {
    status: fields.isPending,
    priority: fields.isPending,
    category: fields.isPending,
    label: fields.isPending,
    assignee: loadingPeople,
    reporter: loadingPeople,
  };
  return { options, loading };
}
