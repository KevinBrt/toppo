import type { Locale } from '@toppo-tracker/shared';

const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;

/**
 * A file's size as people read it: "248 kB", "1.5 MB" ("248 ko", "1,5 Mo" in French). A file
 * smaller than a kilobyte counts as one, as file managers show it.
 */
export function formatFileSize(bytes: number, locale: Locale): string {
  const inMegabytes = bytes >= MEBIBYTE;
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: inMegabytes ? 'megabyte' : 'kilobyte',
    unitDisplay: 'short',
    maximumFractionDigits: inMegabytes ? 1 : 0,
  }).format(inMegabytes ? bytes / MEBIBYTE : Math.max(1, Math.round(bytes / KIBIBYTE)));
}
