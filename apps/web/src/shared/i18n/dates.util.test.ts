import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDay, formatFullDateTime, formatRelativeTime } from './dates.util.ts';

const NOW = new Date('2026-10-22T15:00:00');

describe('formatDateTime', () => {
  it('shows only the time of a moment of today, the date too otherwise', () => {
    const today = new Date('2026-10-22T09:14:00').toISOString();
    const before = new Date('2026-10-20T09:14:00').toISOString();

    expect(formatDateTime(today, 'en', NOW)).toBe('9:14 AM');
    expect(formatDateTime(before, 'fr', NOW)).toBe('20 oct. 2026, 09:14');
  });
});

describe('formatFullDateTime', () => {
  it('always shows the date, today too', () => {
    const today = new Date('2026-10-22T09:14:00').toISOString();

    expect(formatFullDateTime(today, 'fr')).toBe('22 oct. 2026, 09:14');
  });
});

describe('formatDay', () => {
  it('writes a calendar day the same wherever the reader is', () => {
    expect(formatDay('2026-11-02', 'en')).toBe('Nov 2, 2026');
    expect(formatDay('2026-01-01', 'fr')).toBe('1 janv. 2026');
  });
});

describe('formatRelativeTime', () => {
  it.each([
    [10_000, 'now'],
    [5 * 60_000, '5 min. ago'],
    [3 * 3_600_000, '3 hr. ago'],
    [24 * 3_600_000, 'yesterday'],
    [62 * 24 * 3_600_000, '2 mo. ago'],
    [800 * 24 * 3_600_000, '2 yr. ago'],
  ])('says how long ago %i ms was', (elapsed, expected) => {
    const iso = new Date(NOW.getTime() - elapsed).toISOString();

    expect(formatRelativeTime(iso, 'en', NOW)).toBe(expected);
  });

  it('speaks French too', () => {
    expect(formatRelativeTime(new Date(NOW.getTime() - 5 * 60_000).toISOString(), 'fr', NOW)).toBe(
      // French puts a non-breaking space between the number and its unit.
      'il y a 5\u00a0min',
    );
  });
});
