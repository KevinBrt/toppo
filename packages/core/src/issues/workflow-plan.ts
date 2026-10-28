import type { WorkflowRequest, WorkflowStatusDraft } from '@toppo-tracker/shared';

type Fields = Omit<WorkflowStatusDraft, 'ref'>;

/** What saving a workflow does to its stored statuses. */
export interface WorkflowPlan {
  /** Statuses the workflow keeps, with what they become and their new place. */
  kept: (Fields & { id: string; position: number })[];
  /** Statuses it adds, by the key the request named them with, in their place. */
  added: (Fields & { ref: string; position: number })[];
  /** Statuses it takes out, and the status (an id, or a new one's key) their issues move to. */
  removed: { statusId: string; moveTo: string }[];
}

/**
 * How saving `request`, the whole workflow, changes its `stored` statuses; `null` when the
 * request was made from statuses that changed meanwhile: one it keeps was taken out (it would come
 * back), or one was added that it neither keeps nor takes out.
 */
export function planWorkflow(
  storedIds: readonly string[],
  request: Pick<WorkflowRequest, 'statuses' | 'removed'>,
): WorkflowPlan | null {
  const stored = new Set(storedIds);
  const kept: WorkflowPlan['kept'] = [];
  const added: WorkflowPlan['added'] = [];
  for (const [position, { ref, ...fields }] of request.statuses.entries()) {
    if (stored.has(ref)) {
      kept.push({ ...fields, id: ref, position });
    } else if (ref.startsWith('new-')) {
      added.push({ ...fields, ref, position });
    } else {
      return null;
    }
  }
  const accounted = new Set([
    ...kept.map(({ id }) => id),
    ...request.removed.map(({ statusId }) => statusId),
  ]);
  if (storedIds.some((id) => !accounted.has(id))) {
    return null;
  }
  // One taken out meanwhile by someone else has gone with its issues already.
  return {
    kept,
    added,
    removed: request.removed.filter(({ statusId }) => stored.has(statusId)),
  };
}

/** The statuses whose issues open or close with the save: those that start or stop closing them. */
export function closingChanges(
  before: readonly { id: string; closes: boolean }[],
  kept: WorkflowPlan['kept'],
): { closing: string[]; reopening: string[] } {
  const closing: string[] = [];
  const reopening: string[] = [];
  for (const status of kept) {
    const was = before.find(({ id }) => id === status.id)?.closes === true;
    const is = status.closes;
    if (is && !was) {
      closing.push(status.id);
    } else if (was && !is) {
      reopening.push(status.id);
    }
  }
  return { closing, reopening };
}
