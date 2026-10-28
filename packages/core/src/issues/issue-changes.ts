import type { IssueAction } from '@toppo-tracker/shared';

/** The fields of an issue changed in place, as opposed to its status and assignee. */
export interface IssueFields {
  title: string;
  description: string;
  categoryId: string;
  priorityId: string;
}

/** One field that changes, with its value before and after. */
export interface IssueChange {
  field: keyof IssueFields;
  from: string;
  to: string;
}

/** What changing each field takes: the words of an issue are its reporter's too, the rest is not. */
const ACTION_OF: Record<keyof IssueFields, IssueAction> = {
  title: 'editText',
  description: 'editText',
  categoryId: 'editFields',
  priorityId: 'editFields',
};

/** The fields `requested` really changes in `current`, in a stable order: one activity each. */
export function issueChanges(
  current: IssueFields,
  requested: { [Field in keyof IssueFields]?: IssueFields[Field] | undefined },
): IssueChange[] {
  const changes: IssueChange[] = [];
  for (const field of Object.keys(ACTION_OF) as (keyof IssueFields)[]) {
    const to = requested[field];
    if (to !== undefined && to !== current[field]) {
      changes.push({ field, from: current[field], to });
    }
  }
  return changes;
}

/** The actions `changes` take, each once. */
export function actionsFor(changes: readonly IssueChange[]): IssueAction[] {
  return [...new Set(changes.map(({ field }) => ACTION_OF[field]))];
}
