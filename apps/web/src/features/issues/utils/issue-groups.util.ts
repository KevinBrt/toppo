import type { IssueGrouping, IssueSummary } from '@toppo-tracker/shared';
import type { IssueSection } from '../models/issue-list.model.ts';

/** The group an issue belongs to: its status, its priority or its assignee (null for no one). */
export function groupKeyOf(issue: IssueSummary, grouping: IssueGrouping): string | null {
  switch (grouping) {
    case 'status':
      return issue.status.id;
    case 'priority':
      return issue.priority.id;
    case 'assignee':
      return issue.assignee?.id ?? null;
  }
}

/**
 * A page cut into its groups. The server sends each group's issues together, so a group ends
 * where the next starts; a list not grouped is one section.
 */
export function sectionsOf<Issue extends IssueSummary>(
  issues: readonly Issue[],
  grouping: IssueGrouping | undefined,
): IssueSection<Issue>[] {
  if (!grouping) {
    return [{ key: null, issues: [...issues] }];
  }
  const sections: IssueSection<Issue>[] = [];
  for (const issue of issues) {
    const key = groupKeyOf(issue, grouping);
    const last = sections.at(-1);
    if (last && last.key === key) {
      last.issues.push(issue);
    } else {
      sections.push({ key, issues: [issue] });
    }
  }
  return sections;
}
