import type { IssueAction } from '@toppo-tracker/shared';
import { can } from '../permissions/grants.ts';

/** Which issues of a project someone sees: all of them, those they reported, or none. */
export type IssueVisibility = 'all' | 'own' | 'none';

/** Which issues someone with `permissions` in a project sees. */
export function issueVisibilityOf(permissions: readonly string[]): IssueVisibility {
  if (can(permissions, 'issue.read')) {
    return 'all';
  }
  return can(permissions, 'issue.read.own') ? 'own' : 'none';
}

/** Whether someone sees an issue: every one, or those they reported. */
export function canSeeIssue(permissions: readonly string[], reportedByThem: boolean): boolean {
  const visibility = issueVisibilityOf(permissions);
  return visibility === 'all' || (visibility === 'own' && reportedByThem);
}

/**
 * What someone may do on an issue they see. Whoever reported it may fix its title and
 * description, and attach files to it; anyone may follow it; the rest needs the permission, on
 * their own issues too.
 */
export function issueActionsOf(
  permissions: readonly string[],
  reportedByThem: boolean,
): IssueAction[] {
  const editsAny = can(permissions, 'issue.update');
  const granted: Record<IssueAction, boolean> = {
    editText: editsAny || reportedByThem,
    attach: editsAny || reportedByThem,
    editFields: editsAny,
    changeStatus: editsAny,
    assign: can(permissions, 'issue.assign'),
    delete: can(permissions, 'issue.delete'),
    comment: can(permissions, 'comment.create'),
    follow: true,
  };
  return (Object.keys(granted) as IssueAction[]).filter((action) => granted[action]);
}
