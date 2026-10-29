import { describe, expect, it } from 'vitest';
import { formatDuration, formatNumber } from './numbers.util.ts';
import { createTranslator } from './translate.util.ts';

describe('formatNumber', () => {
  it('writes a number in the reader’s way, every decimal kept', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    // French groups thousands with a narrow no-break space.
    expect(formatNumber(1234.5, 'fr')).toBe('1 234,5');
    expect(formatNumber(0.125, 'en')).toBe('0.125');
    expect(formatNumber(-3, 'en')).toBe('-3');
  });
});

describe('formatDuration', () => {
  const en = createTranslator('en');

  it('writes minutes as hours then minutes, to the minute', () => {
    expect(formatDuration(400, en, 'en')).toBe('6 h 40');
    expect(formatDuration(365, en, 'en')).toBe('6 h 05');
    expect(formatDuration(360, en, 'en')).toBe('6 h');
    expect(formatDuration(40, en, 'en')).toBe('40 min');
    expect(formatDuration(0, en, 'en')).toBe('0 min');
    expect(formatDuration(89.6, en, 'en')).toBe('1 h 30');
    expect(formatDuration(-90, en, 'en')).toBe('−1 h 30');
  });

  it('groups many hours as the reader does', () => {
    expect(formatDuration(60_000 + 15, en, 'en')).toBe('1,000 h 15');
    expect(formatDuration(60_000, createTranslator('fr'), 'fr')).toBe('1 000 h');
  });
});
