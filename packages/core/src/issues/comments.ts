import { COMMENT_ACTIONS, type CommentAction } from '@toppo-tracker/shared';
import { can } from '../permissions/grants.ts';

/**
 * What someone may do on a comment of an issue they see. Its author edits it and deletes it,
 * while they may still comment; a moderator deletes any, but changes nobody's words.
 */
export function commentActionsOf(
  permissions: readonly string[],
  writtenByThem: boolean,
): CommentAction[] {
  const writesHere = writtenByThem && can(permissions, 'comment.create');
  const granted: Record<CommentAction, boolean> = {
    edit: writesHere,
    delete: writesHere || can(permissions, 'comment.moderate'),
  };
  return COMMENT_ACTIONS.filter((action) => granted[action]);
}
