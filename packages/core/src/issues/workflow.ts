import type { WorkflowMode } from '@toppo-tracker/shared';

/** A workflow, as far as choosing it goes: the instance's (`projectId` null) or a project's copy. */
export interface WorkflowOwner {
  projectId: string | null;
}

/**
 * The workflow a project follows: its own copy if it made one, else the instance's. `workflows`
 * holds the instance's and, if any, the project's.
 */
export function effectiveWorkflow<W extends WorkflowOwner>(
  workflows: readonly W[],
  projectId: string,
): W {
  const workflow =
    workflows.find((candidate) => candidate.projectId === projectId) ??
    workflows.find((candidate) => candidate.projectId === null);
  if (!workflow) {
    throw new Error('The instance has no workflow');
  }
  return workflow;
}

/** Where new issues start in a workflow, given its steps. */
export function initialStatusOf(
  steps: readonly { statusId: string; isInitial: boolean }[],
): string {
  const initial = steps.find((step) => step.isInitial);
  if (!initial) {
    throw new Error('The workflow has no initial status');
  }
  return initial.statusId;
}

/** A move a workflow allows, from one of its statuses to another. */
export interface Transition {
  fromStatusId: string;
  toStatusId: string;
}

/** What a workflow knows of the moves between its statuses. */
export interface WorkflowMoves {
  mode: WorkflowMode;
  /** Its statuses, in order. */
  statusIds: readonly string[];
  /** Followed while the mode is `defined`, kept while it is `free`. */
  transitions: readonly Transition[];
}

/**
 * The statuses an issue may move to from `statusId`: those the transitions list, or every other
 * status of a free workflow. People choose an issue's status; the workflow only says which moves
 * are possible, for everyone, administrators included.
 */
export function nextStatusesOf(workflow: WorkflowMoves, statusId: string): string[] {
  if (workflow.mode === 'free') {
    return workflow.statusIds.includes(statusId)
      ? workflow.statusIds.filter((id) => id !== statusId)
      : [];
  }
  return workflow.transitions
    .filter((transition) => transition.fromStatusId === statusId)
    .map((transition) => transition.toStatusId);
}

/** Whether the workflow lets an issue move from one status to the other. */
export function canMoveTo(workflow: WorkflowMoves, from: string, to: string): boolean {
  return nextStatusesOf(workflow, from).includes(to);
}

/**
 * When an issue was closed, once it moves to a status that `closes` it or not: when it first
 * reached a closing status, kept while it moves between closing statuses, and cleared when it is
 * reopened.
 */
export function closedAtFor(closes: boolean, previous: Date | null, now: Date): Date | null {
  return closes ? (previous ?? now) : null;
}
