import type { Locale } from '@toppo-tracker/shared';

/** A number as the reader writes it, every decimal kept: "1,234.5" ("1 234,5" in French). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
}
