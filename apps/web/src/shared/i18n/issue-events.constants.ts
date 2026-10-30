import type { PlainMessageKey } from './i18n.types.ts';

/**
 * Each event told outside Toppo, to plugins and webhooks, as a sentence, in the order they are
 * offered. The plugin SDK names them (`EVENT_TYPES`); the web app does not depend on the SDK, so
 * they are listed again here. One Toppo adds later shows by its name until it is worded.
 */
export const ISSUE_EVENT_MESSAGES: ReadonlyMap<string, PlainMessageKey> = new Map<
  string,
  PlainMessageKey
>([
  ['issue.created', 'issueEvents.issueCreated'],
  ['issue.deleted', 'issueEvents.issueDeleted'],
  ['issue.titleChanged', 'issueEvents.issueTitleChanged'],
  ['issue.descriptionChanged', 'issueEvents.issueDescriptionChanged'],
  ['issue.statusChanged', 'issueEvents.issueStatusChanged'],
  ['issue.categoryChanged', 'issueEvents.issueCategoryChanged'],
  ['issue.priorityChanged', 'issueEvents.issuePriorityChanged'],
  ['issue.assigneeChanged', 'issueEvents.issueAssigneeChanged'],
  ['issue.labelsChanged', 'issueEvents.issueLabelsChanged'],
  ['issue.propertyChanged', 'issueEvents.issuePropertyChanged'],
  ['issue.duplicateChanged', 'issueEvents.issueDuplicateChanged'],
  ['issue.commented', 'issueEvents.issueCommented'],
  ['issue.commentEdited', 'issueEvents.issueCommentEdited'],
  ['issue.commentDeleted', 'issueEvents.issueCommentDeleted'],
  ['issue.attachmentAdded', 'issueEvents.issueAttachmentAdded'],
  ['issue.attachmentRemoved', 'issueEvents.issueAttachmentRemoved'],
]);
