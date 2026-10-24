import { describe, expect, it } from 'vitest';
import { formatNumber } from './numbers.util.ts';

describe('formatNumber', () => {
  it('writes a number in the reader’s way, every decimal kept', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    // French groups thousands with a narrow no-break space.
    expect(formatNumber(1234.5, 'fr')).toBe('1 234,5');
    expect(formatNumber(0.125, 'en')).toBe('0.125');
    expect(formatNumber(-3, 'en')).toBe('-3');
  });
});
