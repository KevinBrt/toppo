import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ProjectSummary, ProjectsQuery } from '@toppo/shared';
import { Alert, Avatar, cn, Input } from '@toppo/ui';
import { SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { requestErrorMessage } from '../../../../shared/forms/form-errors.util.ts';
import { formatRelativeTime } from '../../../../shared/i18n/dates.util.ts';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { Pager } from '../../../../shared/layout/pager.tsx';
import { ProjectsQueries } from '../../queries/projects.queries.ts';
import { ProjectMark } from '../project-mark.tsx';

/** The search goes to the server once typing pauses, not on every key. */
const SEARCH_DELAY_MS = 300;

/**
 * One page of projects, active or archived, as the server searched them; each row opens its
 * project. Reports filter changes, for the caller to keep in the URL.
 */
export function ProjectsList({
  query,
  onQueryChange,
}: {
  query: ProjectsQuery;
  onQueryChange: (query: ProjectsQuery) => void;
}) {
  const { t, locale } = useI18n();
  const projects = useQuery(ProjectsQueries.list(query));
  const state = query.state ?? 'active';
  const search = query.search ?? '';
  const [typed, setTyped] = useState(search);

  // Follows the address bar too: back and forward change the search.
  useEffect(() => setTyped(search), [search]);

  useEffect(() => {
    if (typed.trim() === search) {
      return;
    }
    const timer = setTimeout(
      () => onQueryChange({ state, search: typed.trim() || undefined }),
      SEARCH_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [typed, search, state, onQueryChange]);

  if (projects.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('projects.loading')}
      </p>
    );
  }
  if (projects.isError) {
    return <Alert tone="danger">{requestErrorMessage(projects.error, t)}</Alert>;
  }

  const { rows, counts, matching, page, pageSize } = projects.data;
  const emptyMessage = () => {
    if (search) {
      return t('projects.noMatch');
    }
    return state === 'archived' ? t('projects.noArchived') : t('projects.emptyDescription');
  };
  // The counts of issues come only on the projects screen, for those who manage the projects.
  const withIssues = rows.some((project) => project.issues !== null);
  const tabs = [
    { value: 'active', label: t('projects.active'), count: counts.active },
    { value: 'archived', label: t('projects.archived'), count: counts.archived },
  ] as const;
  return (
    <section
      aria-busy={projects.isPlaceholderData}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-xs"
    >
      <div className="flex flex-col gap-3 border-b border-border px-4 sm:flex-row sm:items-center sm:justify-between">
        <fieldset className="-mb-px flex min-w-0 gap-5">
          <legend className="sr-only">{t('projects.stateLabel')}</legend>
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={state === tab.value}
              onClick={() => onQueryChange({ state: tab.value, search: query.search })}
              className={cn(
                'flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 text-sm font-medium transition-colors',
                state === tab.value
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span className="rounded-full bg-surface-muted px-1.5 text-xs text-muted-foreground">
                {tab.count}
              </span>
            </button>
          ))}
        </fieldset>
        <div className="relative pb-3 sm:w-64 sm:py-2">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-5 left-3 size-4 -translate-y-1/2 text-muted-foreground sm:top-1/2"
          />
          <Input
            type="search"
            aria-label={t('projects.search')}
            value={typed}
            maxLength={100}
            placeholder={t('projects.search')}
            onChange={(event) => setTyped(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage()}</p>
      ) : (
        <table className="w-full table-fixed text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2.5 pr-2 pl-4 font-medium">
                {t('projects.project')}
              </th>
              <th scope="col" className="hidden w-32 px-2 py-2.5 font-medium sm:table-cell">
                {t('projects.key')}
              </th>
              <th scope="col" className="hidden w-52 px-2 py-2.5 font-medium md:table-cell">
                {t('projects.members')}
              </th>
              {withIssues ? (
                <>
                  <th scope="col" className="hidden w-40 px-2 py-2.5 font-medium lg:table-cell">
                    {t('projects.openIssues')}
                  </th>
                  <th scope="col" className="hidden w-36 px-2 py-2.5 font-medium xl:table-cell">
                    {t('projects.activity')}
                  </th>
                </>
              ) : null}
              <th scope="col" className="w-12 py-2.5 pr-4">
                <span className="sr-only">{t('projects.actions')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </tbody>
        </table>
      )}
      <Pager
        page={page}
        pageSize={pageSize}
        matching={matching}
        shown={rows.length}
        label={(count) => t(`projects.shown.${pluralForm(locale, count)}`, { count })}
        onPage={(next) => onQueryChange({ ...query, page: next })}
      />
    </section>
  );
}

/** A project, the whole row opening it: its name is the link, stretched over the row. */
function ProjectRow({ project }: { project: ProjectSummary }) {
  // Only the background eases: a row moving up gets its line at once, not fading from the text
  // color.
  return (
    <tr className="relative transition-[background-color] hover:bg-surface-hover">
      <td className="py-3 pr-2 pl-4">
        <div className="flex min-w-0 items-center gap-3">
          <ProjectMark name={project.name} color={project.color} />
          <div className="min-w-0">
            <Link
              to="/projects/$projectKey"
              params={{ projectKey: project.key }}
              className="block truncate font-medium text-foreground outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
            >
              {project.name}
            </Link>
            <p className="truncate text-muted-foreground">
              <span className="font-mono text-xs sm:hidden">{project.key} </span>
              {project.description}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-2 py-3 sm:table-cell">
        <span className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-xs font-medium text-muted-foreground">
          {project.key}
        </span>
      </td>
      <td className="hidden px-2 py-3 md:table-cell">
        {project.members ? <MembersStack members={project.members} /> : null}
      </td>
      {project.issues ? <IssueCells issues={project.issues} /> : null}
      <td className="py-3 pr-4">
        <SlidersHorizontalIcon
          aria-hidden="true"
          className="ml-auto size-4 text-muted-foreground"
        />
      </td>
    </tr>
  );
}

/** How many issues are open, urgent ones apart, and when the project last changed. */
function IssueCells({ issues }: { issues: NonNullable<ProjectSummary['issues']> }) {
  const { t, locale } = useI18n();

  return (
    <>
      <td className="hidden px-2 py-3 lg:table-cell">
        <span className="font-semibold text-foreground">{issues.open}</span>
        {issues.urgent > 0 ? (
          <span className="ml-2 text-xs font-medium text-danger">
            {t(`projects.urgentIssues.${pluralForm(locale, issues.urgent)}`, {
              count: issues.urgent,
            })}
          </span>
        ) : null}
      </td>
      <td className="hidden px-2 py-3 text-muted-foreground xl:table-cell">
        {issues.lastActivityAt ? (
          <time dateTime={issues.lastActivityAt}>
            {formatRelativeTime(issues.lastActivityAt, locale)}
          </time>
        ) : (
          t('projects.noActivity')
        )}
      </td>
    </>
  );
}

/** The first members' initials and how many more there are; read out as a count. */
function MembersStack({ members }: { members: NonNullable<ProjectSummary['members']> }) {
  const { t, locale } = useI18n();

  if (members.count === 0) {
    return <span className="text-muted-foreground">{t('projects.noMembers')}</span>;
  }
  const more = members.count - members.shown.length;
  return (
    <>
      <span className="sr-only">
        {t(`projects.membersCount.${pluralForm(locale, members.count)}`, { count: members.count })}
      </span>
      <span aria-hidden="true" className="flex -space-x-1.5">
        {members.shown.map((member) => (
          <Avatar key={member.userId} name={member.name} className="size-7 ring-2 ring-surface" />
        ))}
        {more > 0 ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-surface-muted text-xs font-medium text-muted-foreground ring-2 ring-surface">
            {t('projects.moreMembers', { count: more })}
          </span>
        ) : null}
      </span>
    </>
  );
}
