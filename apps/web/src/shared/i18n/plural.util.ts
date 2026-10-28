import type { Locale } from '@toppo-tracker/shared';

/**
 * The plural form of `count` in `locale`, among the two the catalogs carry: `t(\`members.count.${form}\`)`.
 * French says "0 membre", English "0 members": the rules come from `Intl`, not from us.
 */
export function pluralForm(locale: Locale, count: number): 'one' | 'other' {
  return new Intl.PluralRules(locale).select(count) === 'one' ? 'one' : 'other';
}
