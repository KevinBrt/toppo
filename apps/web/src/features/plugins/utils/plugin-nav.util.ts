import type { Locale, PluginScreen } from '@toppo-tracker/shared';
import type { AddedNavItem, AddedNavSection } from '../../../shared/layout/navigation.constants.ts';
import { screenIconOf } from '../constants/screen-icons.constants.ts';

/**
 * The entries plugins' pages add to a menu, one section per plugin named after it, in the reader's
 * language: pages without an entry are reached by their links only.
 */
export function pluginNavSections(
  screens: readonly PluginScreen[],
  locale: Locale,
  linkOf: (screen: PluginScreen) => Pick<AddedNavItem, 'to' | 'params'>,
): AddedNavSection[] {
  const sections = new Map<string, AddedNavSection & { items: AddedNavItem[] }>();
  for (const screen of screens) {
    if (!screen.entry) {
      continue;
    }
    const section = sections.get(screen.pluginSlug) ?? {
      key: screen.pluginSlug,
      label: screen.plugin[locale],
      items: [],
    };
    section.items.push({
      key: `${screen.pluginSlug}/${screen.name}`,
      label: screen.entry.label[locale],
      icon: screenIconOf(screen.entry.icon),
      ...linkOf(screen),
    });
    sections.set(screen.pluginSlug, section);
  }
  return [...sections.values()];
}
