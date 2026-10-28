import type { PaletteColor, WorkflowMode } from '@toppo-tracker/shared';

/** A status as the editor changes it, before the workflow is saved. */
export interface StatusDraft {
  /** Stable while editing: the id, or `new-1`… for a status added in the editor. */
  key: string;
  /** Absent until a new status is saved. */
  id?: string;
  name: string;
  color: PaletteColor;
  /** Issues on it are closed. */
  closes: boolean;
  /** Issues on it that follow this workflow: they move when it is taken out. */
  issueCount: number;
  /** One of the instance's, in a project's copy: its name, color and closing are not edited here. */
  shared: boolean;
}

/** A move a workflow allows, between two statuses named by their keys. */
export interface MoveDraft {
  from: string;
  to: string;
}

/** A whole workflow as the editor changes it. */
export interface WorkflowDraft {
  mode: WorkflowMode;
  /** In order. */
  statuses: StatusDraft[];
  /** The key of the status new issues start in. */
  initialKey: string;
  /** Kept while the mode is free, for when it is defined again. */
  moves: MoveDraft[];
  /** Saved statuses taken out, and the key of the status their issues move to. */
  removed: { statusId: string; moveTo: string }[];
}
