import { useQuery } from '@tanstack/react-query';
import type { IssuesQuery, IssueWithProject } from '@toppo-tracker/shared';
import { cn, swatchClassName } from '@toppo-tracker/ui';
import type { ReactNode } from 'react';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { IssuesQueries } from '../../queries/issues.queries.ts';
import { IssuesTable } from './issues-table.tsx';

/**
 * One page of the issues assigned to the signed-in person, open or closed, in every project they
 * reach: the most urgent first, then the newest. Each row says its project.
 */
export function AssignedIssuesList({
  query,
  empty,
  onQueryChange,
}: {
  query: IssuesQuery;
  /** Shown when nothing is assigned to them. */
  empty: ReactNode;
  onQueryChange: (query: IssuesQuery) => void;
}) {
  const { t } = useI18n();
  const issues = useQuery(IssuesQueries.assigned(query));

  return (
    <IssuesTable
      issues={issues}
      empty={empty}
      last={{
        header: t('issues.project'),
        cell: (issue) => <ProjectName project={issue.project} />,
      }}
      onPage={(page) => onQueryChange({ ...query, page })}
    />
  );
}

function ProjectName({ project }: { project: IssueWithProject['project'] }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', swatchClassName(project.color))}
      />
      <span className="truncate">{project.name}</span>
    </span>
  );
}
