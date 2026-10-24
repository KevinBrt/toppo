import type { IssueResponse } from '@toppo/shared';
import type { IssueEdit } from '../models/issue-edit.model.ts';

/** The issue as it will be once `edit` is saved: shown at once, rolled back if refused. */
export function applyEdit(issue: IssueResponse, edit: IssueEdit): IssueResponse {
  switch (edit.field) {
    case 'title':
      return { ...issue, title: edit.title };
    case 'description':
      return { ...issue, description: edit.description };
    case 'category':
      return { ...issue, category: edit.category };
    case 'priority':
      return { ...issue, priority: edit.priority };
    case 'status':
      return { ...issue, status: edit.status };
    case 'assignee':
      return { ...issue, assignee: edit.assignee };
    case 'labels':
      return { ...issue, labels: edit.labels };
    case 'property': {
      const others = issue.properties.filter(({ id }) => id !== edit.property.id);
      return {
        ...issue,
        properties: edit.option ? [...others, { ...edit.property, option: edit.option }] : others,
      };
    }
  }
}
