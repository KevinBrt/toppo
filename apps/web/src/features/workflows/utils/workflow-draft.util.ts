import type { WorkflowRequest, WorkflowResponse, WorkflowStatusRow } from '@toppo-tracker/shared';
import type { MoveDraft, StatusDraft, WorkflowDraft } from '../models/workflow-draft.model.ts';

let created = 0;

/** A key for a status added in the editor, the way the server expects new ones named. */
export function newStatusKey(): string {
  created += 1;
  return `new-${created}`;
}

/** The workflow as saved, ready to be changed; a project's copy says which statuses it shares. */
export function draftOf({
  mode,
  statuses,
  transitions,
}: Omit<WorkflowResponse, 'statuses'> & {
  statuses: readonly (WorkflowStatusRow & { shared?: boolean })[];
}): WorkflowDraft {
  return {
    mode,
    statuses: statuses.map(({ id, name, color, closes, issueCount, shared }) => ({
      key: id,
      id,
      name,
      color,
      closes,
      issueCount,
      shared: shared ?? false,
    })),
    initialKey: statuses.find(({ isInitial }) => isInitial)?.id ?? '',
    moves: transitions,
    removed: [],
  };
}

/** The request that saves `draft`. */
export function requestOf({
  mode,
  statuses,
  initialKey,
  moves,
  removed,
}: WorkflowDraft): WorkflowRequest {
  return {
    mode,
    statuses: statuses.map(({ key, name, color, closes }) => ({
      ref: key,
      name,
      color,
      closes,
      isInitial: key === initialKey,
    })),
    transitions: moves,
    removed,
  };
}

const sameMove = (left: MoveDraft, right: MoveDraft) =>
  left.from === right.from && left.to === right.to;

/** Whether an issue may move from one status to the other, as the moves stand. */
export function allows(moves: readonly MoveDraft[], from: string, to: string): boolean {
  return moves.some((move) => sameMove(move, { from, to }));
}

/** Allows the move if it was not, forbids it if it was. */
export function toggleMove(draft: WorkflowDraft, from: string, to: string): WorkflowDraft {
  return {
    ...draft,
    moves: allows(draft.moves, from, to)
      ? draft.moves.filter((move) => !sameMove(move, { from, to }))
      : [...draft.moves, { from, to }],
  };
}

/** How many statuses an issue may move to from `key`, as the moves stand. */
export function exitsOf(draft: WorkflowDraft, key: string): number {
  return draft.moves.filter(({ from }) => from === key).length;
}

/**
 * Takes a status out, its moves with it. A saved one is named for the server, its issues moving
 * to `moveTo`; issues headed for it go there too.
 */
export function removeStatus(draft: WorkflowDraft, key: string, moveTo: string): WorkflowDraft {
  const status = draft.statuses.find((candidate) => candidate.key === key);
  const removed = draft.removed.map((entry) =>
    entry.moveTo === key ? { ...entry, moveTo } : entry,
  );
  return {
    ...draft,
    statuses: draft.statuses.filter((candidate) => candidate.key !== key),
    moves: draft.moves.filter(({ from, to }) => from !== key && to !== key),
    removed: status?.id ? [...removed, { statusId: status.id, moveTo }] : removed,
  };
}

/** Changes one status's name, color or closing. */
export function updateStatus(
  draft: WorkflowDraft,
  key: string,
  fields: Partial<Pick<StatusDraft, 'name' | 'color' | 'closes'>>,
): WorkflowDraft {
  return {
    ...draft,
    statuses: draft.statuses.map((status) =>
      status.key === key ? { ...status, ...fields } : status,
    ),
  };
}

/**
 * How many changes `draft` makes to `saved`: each status added, taken out or edited, a new
 * order, a new initial status, a new mode, and each move allowed or forbidden.
 */
export function countChanges(saved: WorkflowDraft, draft: WorkflowDraft): number {
  const before = new Map(saved.statuses.map((status) => [status.key, status]));
  const kept = draft.statuses.filter(({ key }) => before.has(key));
  const added = draft.statuses.length - kept.length;
  const edited = kept.filter((status) => {
    const was = before.get(status.key);
    return was?.name !== status.name || was.color !== status.color || was.closes !== status.closes;
  }).length;
  const keptBefore = saved.statuses.filter(({ key }) => kept.some((status) => status.key === key));
  const reordered = keptBefore.some((status, index) => kept[index]?.key !== status.key) ? 1 : 0;
  const moves =
    draft.moves.filter((move) => !saved.moves.some((other) => sameMove(move, other))).length +
    saved.moves.filter(
      (move) =>
        !draft.moves.some((other) => sameMove(move, other)) &&
        kept.some(({ key }) => key === move.from) &&
        kept.some(({ key }) => key === move.to),
    ).length;
  return (
    added +
    draft.removed.length +
    edited +
    reordered +
    moves +
    (saved.initialKey === draft.initialKey ? 0 : 1) +
    (saved.mode === draft.mode ? 0 : 1)
  );
}
