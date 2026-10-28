import { PROJECT_KEY_MAX_LENGTH, PROJECT_KEY_MIN_LENGTH } from '@toppo-tracker/shared';

/**
 * A key to suggest for a project's name: the initials of its words ("Portail clients" → `PC`),
 * or the start of a single word ("Website" → `WEB`). Empty when the name gives nothing usable;
 * the person may always type another.
 */
export function suggestProjectKey(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  const key = (
    words.length > 1 ? words.map((word) => word[0]).join('') : (words[0] ?? '').slice(0, 3)
  )
    .replace(/^[0-9]+/, '')
    .slice(0, PROJECT_KEY_MAX_LENGTH);
  return key.length >= PROJECT_KEY_MIN_LENGTH ? key : '';
}
