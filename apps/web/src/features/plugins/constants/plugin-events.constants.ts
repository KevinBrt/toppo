import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';

/**
 * Each event a plugin may listen to, as a sentence. The plugin SDK names them (`EVENT_TYPES`);
 * the web app does not depend on the SDK, so they are listed again here. One Toppo adds later
 * shows by its name until it is worded.
 */
export const PLUGIN_EVENT_MESSAGES: ReadonlyMap<string, PlainMessageKey> = new Map<
  string,
  PlainMessageKey
>([
  ['issue.created', 'plugins.events.issueCreated'],
  ['issue.deleted', 'plugins.events.issueDeleted'],
  ['issue.titleChanged', 'plugins.events.issueTitleChanged'],
  ['issue.descriptionChanged', 'plugins.events.issueDescriptionChanged'],
  ['issue.statusChanged', 'plugins.events.issueStatusChanged'],
  ['issue.categoryChanged', 'plugins.events.issueCategoryChanged'],
  ['issue.priorityChanged', 'plugins.events.issuePriorityChanged'],
  ['issue.assigneeChanged', 'plugins.events.issueAssigneeChanged'],
  ['issue.labelsChanged', 'plugins.events.issueLabelsChanged'],
  ['issue.propertyChanged', 'plugins.events.issuePropertyChanged'],
  ['issue.duplicateChanged', 'plugins.events.issueDuplicateChanged'],
  ['issue.commented', 'plugins.events.issueCommented'],
  ['issue.commentEdited', 'plugins.events.issueCommentEdited'],
  ['issue.commentDeleted', 'plugins.events.issueCommentDeleted'],
  ['issue.attachmentAdded', 'plugins.events.issueAttachmentAdded'],
  ['issue.attachmentRemoved', 'plugins.events.issueAttachmentRemoved'],
]);
