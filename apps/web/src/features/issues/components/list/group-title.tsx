import type { IssueGrouping, IssueSummary } from '@toppo-tracker/shared';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import { pluralForm } from '../../../../shared/i18n/plural.util.ts';
import { PersonName } from '../fields/person-name.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { StatusLabel } from '../fields/status-label.tsx';

/**
 * What heads a group of issues: its status, priority or assignee, taken from one of its issues,
 * and how many issues it holds across every page.
 */
export function GroupTitle({
  grouping,
  issue,
  size,
}: {
  grouping: IssueGrouping;
  issue: IssueSummary;
  size: number;
}) {
  const { t, locale } = useI18n();

  return (
    <span className="flex min-w-0 items-center gap-2">
      <GroupName grouping={grouping} issue={issue} />
      <span className="shrink-0 rounded-full bg-surface px-1.5 text-muted-foreground">
        <span aria-hidden="true">{size}</span>
        <span className="sr-only">
          {t(`issues.list.groupSize.${pluralForm(locale, size)}`, { count: size })}
        </span>
      </span>
    </span>
  );
}

function GroupName({ grouping, issue }: { grouping: IssueGrouping; issue: IssueSummary }) {
  const { t } = useI18n();

  switch (grouping) {
    case 'status':
      return <StatusLabel status={issue.status} />;
    case 'priority':
      return <PriorityLabel priority={issue.priority} />;
    case 'assignee':
      return issue.assignee ? (
        <PersonName person={issue.assignee} />
      ) : (
        <span className="text-muted-foreground">{t('issues.unassigned')}</span>
      );
  }
}
