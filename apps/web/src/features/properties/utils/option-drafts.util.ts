import { OPTION_PROBLEMS, PALETTE_COLORS, type PaletteColor } from '@toppo-tracker/shared';
import type { z } from 'zod';
import type { OptionDraft } from '../models/option-draft.model.ts';

/** What can be wrong with one option's name, for the panel to say. */
export type NameProblem = 'blank' | 'tooLong' | 'duplicate';

let created = 0;

/** A key for an option added in the panel: no id until the list is saved. */
export function newOptionKey(): string {
  created += 1;
  return `new-${created}`;
}

/** The first color no option has yet, so that a new one stands out; then round again. */
export function nextColor(drafts: readonly OptionDraft[]): PaletteColor {
  const used = new Set(drafts.map(({ color }) => color));
  return (
    PALETTE_COLORS.find((color) => !used.has(color)) ??
    PALETTE_COLORS[drafts.length % PALETTE_COLORS.length] ??
    'gray'
  );
}

/**
 * The problems the shared schema found in the list, by option key: a name left blank, too long,
 * or another option's, the same rules the server applies.
 */
export function nameProblemsOf(
  issues: readonly z.core.$ZodIssue[],
  drafts: readonly OptionDraft[],
): Map<string, NameProblem> {
  const problems = new Map<string, NameProblem>();
  for (const issue of issues) {
    const [, index, field] = issue.path;
    const draft = typeof index === 'number' ? drafts[index] : undefined;
    if (draft && field === 'name' && !problems.has(draft.key)) {
      problems.set(draft.key, kindOf(issue));
    }
  }
  return problems;
}

function kindOf(issue: z.core.$ZodIssue): NameProblem {
  if (issue.code === 'too_big') {
    return 'tooLong';
  }
  return issue.message === OPTION_PROBLEMS.duplicateName ? 'duplicate' : 'blank';
}
