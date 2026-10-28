import type { CategoryDraft } from '@toppo-tracker/shared';
import { type OptionsPlan, planOptions } from './options-plan.ts';

/** What saving a list of categories does to the stored ones. */
export type CategoriesPlan = OptionsPlan<Omit<CategoryDraft, 'id'>>;

/**
 * How saving `requested`, the whole list in its new order, and deleting `removed` change the
 * stored categories (`planOptions`); deleting needs no issue to have them, checked by the server.
 */
export function planCategories(
  storedIds: readonly string[],
  requested: readonly CategoryDraft[],
  removed: readonly string[],
): CategoriesPlan | null {
  return planOptions(storedIds, requested, removed);
}
