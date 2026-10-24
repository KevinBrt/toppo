import type { Locale } from '@toppo/shared';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A moment in the reader's time zone: its time when it is today, else its date and time. */
export function formatDateTime(iso: string, locale: Locale, now: Date = new Date()): string {
  const date = new Date(iso);
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(
    locale,
    sameDay ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' },
  ).format(date);
}

/** A moment with its full date, whenever it was: "Oct 20, 2026, 9:14 AM". */
export function formatFullDateTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

/**
 * A calendar day, "2026-11-02", as the reader writes it: "Nov 2, 2026". Read in UTC, where it was
 * written, so that it stays the same day wherever the reader is.
 */
export function formatDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/** How long ago a moment was, roughly: "5 minutes ago", "yesterday", "3 months ago". */
export function formatRelativeTime(iso: string, locale: Locale, now: Date = new Date()): string {
  const elapsed = now.getTime() - new Date(iso).getTime();
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
  if (elapsed < MINUTE) {
    return format.format(0, 'second');
  }
  if (elapsed < HOUR) {
    return format.format(-Math.floor(elapsed / MINUTE), 'minute');
  }
  if (elapsed < DAY) {
    return format.format(-Math.floor(elapsed / HOUR), 'hour');
  }
  if (elapsed < 30 * DAY) {
    return format.format(-Math.floor(elapsed / DAY), 'day');
  }
  if (elapsed < 365 * DAY) {
    return format.format(-Math.floor(elapsed / (30 * DAY)), 'month');
  }
  return format.format(-Math.floor(elapsed / (365 * DAY)), 'year');
}
