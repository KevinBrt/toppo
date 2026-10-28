import type { IssueActivity, UserRef } from '@toppo-tracker/shared';

/** Changes one person made at once: shown as one sentence. */
export interface HistoryEntry {
  id: string;
  actor: UserRef;
  /** UTC ISO 8601. */
  createdAt: string;
  changes: IssueActivity[];
}

/**
 * The history as sentences: changes made together (same person, same moment, one request) are
 * grouped, as in "Sarah set the category to Bug and the priority to High". A comment always
 * stands alone.
 */
export function groupHistory(activities: readonly IssueActivity[]): HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  for (const activity of activities) {
    const last = entries.at(-1);
    const together =
      last?.actor.id === activity.actor.id &&
      last.createdAt === activity.createdAt &&
      ![activity, ...last.changes].some((one) => one.type === 'issue.commented');
    if (last && together) {
      last.changes.push(activity);
    } else {
      entries.push({
        id: activity.id,
        actor: activity.actor,
        createdAt: activity.createdAt,
        changes: [activity],
      });
    }
  }
  return entries;
}
