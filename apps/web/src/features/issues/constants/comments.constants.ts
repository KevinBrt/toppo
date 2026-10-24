/** What the server may refuse about a comment, as the reader is told it. */
export const COMMENT_ERRORS = {
  COMMENT_NOT_FOUND: 'issues.comments.notFound',
  INVALID_MENTION: 'issues.comments.invalidMention',
  PROJECT_ARCHIVED: 'projects.archivedNotice',
} as const;
