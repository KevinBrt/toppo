import type { NotificationReason } from '@toppo-tracker/shared';

/** The people involved in an issue, as notifications read them. */
export interface IssuePeople {
  reporterId: string;
  assigneeId: string | null;
  /** Everyone who commented on it, the comment just written included. */
  commenterIds: readonly string[];
  /** Those who chose to follow it. */
  followerIds: readonly string[];
  /** Those who stopped following it: taking part in it no longer tells them anything. */
  unfollowerIds: readonly string[];
}

/** A change to an issue, as far as notifications care about it. */
export type NotifiedChange =
  | {
      type: 'issue.created';
      actorId: string;
      assigneeId: string | null;
      /** Those whose role tells them of new issues (`roles.notify_new_issues`). */
      subscriberIds: readonly string[];
    }
  | {
      type: 'issue.assigneeChanged';
      actorId: string;
      assigneeId: string | null;
      /** Whom it was given to before: told too, while following it. */
      previousAssigneeId: string | null;
    }
  | { type: 'issue.commented'; actorId: string; mentioned: readonly string[] }
  | { type: 'issue.commentEdited'; actorId: string; mentioned: readonly string[] }
  | { type: 'issue.statusChanged'; actorId: string }
  | { type: 'issue.duplicateChanged'; actorId: string }
  | { type: 'other'; actorId: string };

/** Those who take part in an issue: its reporter, its assignee, those who commented on it. */
function participantsOf(people: IssuePeople): string[] {
  return [people.reporterId, people.assigneeId, ...people.commenterIds].filter(
    (userId): userId is string => userId !== null,
  );
}

/**
 * Those who follow an issue, each once: those who take part in it, unless they stopped, and those
 * who chose to follow it.
 */
export function followersOf(people: IssuePeople): string[] {
  const taking = participantsOf(people).filter((userId) => !people.unfollowerIds.includes(userId));
  return [...new Set([...taking, ...people.followerIds])];
}

/**
 * Who is told about a change, and why: of a new issue, its assignee and those whose role asks
 * for it; the person an issue is given to; those a comment names; and those who follow the issue
 * (`followersOf`) of a comment, a status change, a change of assignee, the assignee it had before
 * included, and its marking as a duplicate. Nothing else is told, and nobody is told of what they did themselves. Whether
 * they still see the issue is checked by the caller.
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
  const tellFollowers = (involved: IssuePeople) => {
    for (const userId of followersOf(involved)) {
      tell(userId, involved.followerIds.includes(userId) ? 'following' : 'participating');
    }
  };
  switch (change.type) {
    case 'issue.created':
      tell(change.assigneeId, 'assigned');
      for (const userId of change.subscriberIds) {
        tell(userId, 'newIssue');
      }
      break;
    case 'issue.assigneeChanged':
      tell(change.assigneeId, 'assigned');
      // Its assignee as the change left it, whoever has it by the time people are told.
      tellFollowers({
        ...people,
        assigneeId: change.assigneeId,
        commenterIds: [
          ...people.commenterIds,
          ...(change.previousAssigneeId === null ? [] : [change.previousAssigneeId]),
        ],
      });
      break;
    case 'issue.commented':
      for (const userId of change.mentioned) {
        tell(userId, 'mentioned');
      }
      tellFollowers(people);
      break;
    case 'issue.commentEdited':
      for (const userId of change.mentioned) {
        tell(userId, 'mentioned');
      }
      break;
    case 'issue.statusChanged':
    case 'issue.duplicateChanged':
      tellFollowers(people);
      break;
    case 'other':
      break;
  }
  return recipients;
}
