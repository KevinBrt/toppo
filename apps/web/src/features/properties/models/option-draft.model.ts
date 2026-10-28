import type { PaletteColor } from '@toppo-tracker/shared';

/** An option as the panel edits it, before the list is saved. */
export interface OptionDraft {
  /** Stable while editing, for the list and dragging: the id, or a made-up key for a new one. */
  key: string;
  /** Absent until a new option is saved. */
  id?: string;
  name: string;
  color: PaletteColor;
  /** Issues that have it: an option in use cannot be removed. */
  issueCount: number;
}

/** What is wrong with the list, by option key, as messages to show beside them. */
export type OptionProblems = ReadonlyMap<string, string>;
