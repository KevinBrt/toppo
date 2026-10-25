/** One action on several issues of a project, as the list's bar sends it. */
export type BulkChange =
  | { action: 'status'; statusId: string }
  | { action: 'fields'; categoryId?: string; priorityId?: string }
  | { action: 'assignee'; assigneeId: string | null }
  | { action: 'labels'; add: string[]; remove: string[] }
  | { action: 'delete' };

/** The issues of a page ticked for an action, and the way to tick or untick some. */
export interface IssueSelection {
  selected: readonly string[];
  onSelect: (keys: readonly string[], selected: boolean) => void;
}
