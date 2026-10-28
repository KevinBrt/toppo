import { ATTACHMENT_ACTIONS, type AttachmentAction } from '@toppo-tracker/shared';
import { commentActionsOf } from '../issues/comments.ts';
import { issueActionsOf } from '../issues/issue-access.ts';
import { can } from '../permissions/grants.ts';

/** Where a file is attached: to an issue's request, or to one of its comments. */
export type AttachmentPlace =
  | { on: 'request'; reportedByThem: boolean }
  | { on: 'comment'; writtenByThem: boolean };

/**
 * Whether someone attaches files there, on an issue they see: to its request, whoever may change
 * its words (its reporter, or with `issue.update`); to a comment, its author while they may
 * comment.
 */
export function canAttachTo(permissions: readonly string[], place: AttachmentPlace): boolean {
  return place.on === 'request'
    ? issueActionsOf(permissions, place.reportedByThem).includes('attach')
    : commentActionsOf(permissions, place.writtenByThem).includes('edit');
}

/**
 * What someone may do on a file they see. A file of the request is removed by whoever edits the
 * issue, or by its uploader while they may still attach files there; a file of a comment, by
 * whoever may delete that comment (its author, a moderator).
 */
export function attachmentActionsOf(
  permissions: readonly string[],
  place: AttachmentPlace,
  uploadedByThem: boolean,
): AttachmentAction[] {
  const removes =
    place.on === 'request'
      ? can(permissions, 'issue.update') || (uploadedByThem && canAttachTo(permissions, place))
      : commentActionsOf(permissions, place.writtenByThem).includes('delete');
  const granted: Record<AttachmentAction, boolean> = { delete: removes };
  return ATTACHMENT_ACTIONS.filter((action) => granted[action]);
}
