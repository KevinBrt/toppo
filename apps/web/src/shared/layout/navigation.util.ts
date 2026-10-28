import { canAny } from '@toppo-tracker/core';
import type { NavAudience, NavItem, NavSection } from './navigation.constants.ts';

/** The sections and links a user may use; a section left without links disappears. */
export function visibleSections(
  sections: readonly NavSection[],
  audience: NavAudience,
): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isVisibleTo(item, audience)),
    }))
    .filter((section) => section.items.length > 0);
}

function isVisibleTo(item: NavItem, { permissions, managesProjects }: NavAudience): boolean {
  if (!item.requiresAnyOf || canAny(permissions, item.requiresAnyOf)) {
    return true;
  }
  return item.orToProjectManagers === true && managesProjects === true;
}
