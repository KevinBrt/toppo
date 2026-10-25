import { Link } from '@tanstack/react-router';
import type { IssueGrouping, IssueSummary } from '@toppo/shared';
import { useI18n } from '../../../../shared/i18n/i18n-provider.tsx';
import type { IssueSelection } from '../../models/bulk-change.model.ts';
import type { IssueSection } from '../../models/issue-list.model.ts';
import { SelectCheckbox } from '../bulk/select-checkbox.tsx';
import { LabelChips } from '../fields/label-chips.tsx';
import { PriorityLabel } from '../fields/priority-label.tsx';
import { StatusLabel } from '../fields/status-label.tsx';
import { PropertyChips } from '../properties/property-chips.tsx';
import { GroupTitle } from './group-title.tsx';
import type { LastColumn } from './issues-table.tsx';

/**
 * A page of issues on a phone: one card per issue, the whole card opening it, under the title
 * of its group when the list is grouped; with a selection, a box ticks each.
 */
export function IssueCards<Issue extends IssueSummary>({
  sections,
  grouping,
  sizeOf,
  last,
  showsPriority,
  selection,
}: {
  sections: readonly IssueSection<Issue>[];
  grouping: IssueGrouping | undefined;
  sizeOf: (section: IssueSection<Issue>) => number;
  last: LastColumn<Issue>;
  showsPriority: boolean;
  selection: IssueSelection | undefined;
}) {
  return (
    <div className="divide-y divide-border">
      {sections.map((section) => {
        const [first] = section.issues;
        return (
          <div key={section.key ?? 'none'}>
            {grouping && first ? (
              <h2 className="border-b border-border bg-surface-muted px-4 py-2 text-xs font-medium">
                <GroupTitle grouping={grouping} issue={first} size={sizeOf(section)} />
              </h2>
            ) : null}
            <ul className="divide-y divide-border">
              {section.issues.map((issue) => (
                <IssueCard
                  key={issue.key}
                  issue={issue}
                  last={last}
                  showsPriority={showsPriority}
                  selection={selection}
                />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function IssueCard<Issue extends IssueSummary>({
  issue,
  last,
  showsPriority,
  selection,
}: {
  issue: Issue;
  last: LastColumn<Issue>;
  showsPriority: boolean;
  selection: IssueSelection | undefined;
}) {
  const { t } = useI18n();
  // Only the background eases: a card moving up gets its line at once, not fading from the text
  // color.
  return (
    <li className="relative flex flex-col gap-1.5 px-4 py-3 transition-[background-color] hover:bg-surface-hover">
      <span className="flex items-center justify-between gap-3 text-xs">
        <span className="flex items-center gap-3">
          {selection ? (
            <SelectCheckbox
              label={t('issues.bulk.select', { key: issue.key })}
              checked={selection.selected.includes(issue.key)}
              onChange={(checked) => selection.onSelect([issue.key], checked)}
            />
          ) : null}
          <span className="font-mono font-medium text-muted-foreground">{issue.key}</span>
        </span>
        <StatusLabel status={issue.status} />
      </span>
      <Link
        to="/issues/$issueKey"
        params={{ issueKey: issue.key }}
        className="line-clamp-2 text-sm font-medium break-words text-foreground outline-none after:absolute after:inset-0 focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
      >
        {issue.title}
      </Link>
      <LabelChips labels={issue.labels} max={3} />
      <PropertyChips values={issue.properties} />
      <span className="flex min-h-6 items-center justify-between gap-3 text-xs text-muted-foreground">
        {showsPriority ? <PriorityLabel priority={issue.priority} /> : <span />}
        <span className="min-w-0">{last.cell(issue)}</span>
      </span>
    </li>
  );
}
