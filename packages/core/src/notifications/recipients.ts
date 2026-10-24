import type { NotificationReason } from '@toppo/shared';

/** The people involved in an issue, as notifications read them. */
export interface IssuePeople {
  reporterId: string;
  assigneeId: string | null;
  /** Everyone who commented on it, the comment just written included. */
  commenterIds: readonly string[];
}

/** A change to an issue, as far as notifications care about it. */
export type NotifiedChange =
  | { type: 'issue.assigneeChanged'; actorId: string; assigneeId: string | null }
  | { type: 'issue.commented'; actorId: string; mentioned: readonly string[] }
  | { type: 'issue.commentEdited'; actorId: string; mentioned: readonly string[] }
  | { type: 'issue.statusChanged'; actorId: string }
  | { type: 'other'; actorId: string };

/**
 * Who is told about a change, and why: the person an issue is given to; those a comment names;
 * the reporter, the assignee and those who commented, of a new comment; the reporter and the
 * assignee, of a status change. Nothing else is told, and nobody is told of what they did
 * themselves. Whether they still see the issue is checked by the caller.
 */
export function recipientsOf(
  change: NotifiedChange,
  people: IssuePeople,
): Map<string, NotificationReason> {
  const recipients = new Map<string, NotificationReason>();
  // The first reason given wins: the most specific comes first.
  const tell = (userId: string | null, reason: NotificationReason) => {
    if (userId !== null && userId !== change.actorId && !recipients.has(userId)) {
      recipients.set(userId, reason);
    }
  };
  switch (change.type) {
    case 'issue.assigneeChanged':
      tell(change.assigneeId, 'assigned');
      break;
    case 'issue.commented':
      for (const userId of change.mentioned) {
        tell(userId, 'mentioned');
      }
      for (const userId of [people.reporterId, people.assigneeId, ...people.commenterIds]) {
        tell(userId, 'participating');
      }
      break;
    case 'issue.commentEdited':
      for (const userId of change.mentioned) {
        tell(userId, 'mentioned');
      }
      break;
    case 'issue.statusChanged':
      tell(people.reporterId, 'participating');
      tell(people.assigneeId, 'participating');
      break;
    case 'other':
      break;
  }
  return recipients;
}
