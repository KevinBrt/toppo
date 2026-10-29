import type { Locale } from '@toppo-tracker/shared';
import type { Translate } from './i18n.types.ts';

/** A number as the reader writes it, every decimal kept: "1,234.5" ("1 234,5" in French). */
export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(value);
}

const MINUTES_PER_HOUR = 60;

/**
 * Minutes as a duration, hours then minutes: "6 h 40", "6 h", "40 min". Rounded to the minute,
 * a negative one signed.
 */
export function formatDuration(minutes: number, t: Translate, locale: Locale): string {
  const whole = Math.round(Math.abs(minutes));
  const hours = Math.floor(whole / MINUTES_PER_HOUR);
  const rest = whole % MINUTES_PER_HOUR;
  const sign = minutes < 0 && whole > 0 ? '−' : '';
  if (hours === 0) {
    return `${sign}${t('issues.duration.minutes', { minutes: rest })}`;
  }
  const spoken = formatNumber(hours, locale);
  return `${sign}${
    rest === 0
      ? t('issues.duration.hours', { hours: spoken })
      : t('issues.duration.hoursMinutes', { hours: spoken, minutes: String(rest).padStart(2, '0') })
  }`;
}
