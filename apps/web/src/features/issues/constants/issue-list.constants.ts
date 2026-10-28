import type { IssueSort } from '@toppo-tracker/shared';
import type { PlainMessageKey } from '../../../shared/i18n/i18n.types.ts';

/** The name of each sort: the header of the column it sorts. */
export const SORT_LABELS = {
  key: 'issues.key',
  title: 'issues.subject',
  reporter: 'issues.reporter',
  category: 'issues.category',
  priority: 'issues.priority',
  status: 'issues.status',
  assignee: 'issues.assignee',
  updated: 'issues.updated',
} as const satisfies Record<IssueSort, PlainMessageKey>;
