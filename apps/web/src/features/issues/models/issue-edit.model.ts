import type { IssuePropertyValue, IssueResponse, LabelRef, UserRef } from '@toppo/shared';

/** One change to an issue, as the page asks for it: enough to show it before the server answers. */
export type IssueEdit =
  | { field: 'title'; title: string }
  | { field: 'description'; description: string }
  | { field: 'category'; category: IssueResponse['category'] }
  | { field: 'priority'; priority: IssueResponse['priority'] }
  | { field: 'status'; status: IssueResponse['status'] }
  | { field: 'assignee'; assignee: UserRef | null }
  | { field: 'labels'; labels: LabelRef[] }
  | {
      field: 'property';
      propertyId: string;
      /** The value as it will read; `null` takes it away. */
      value: IssuePropertyValue | null;
    };
