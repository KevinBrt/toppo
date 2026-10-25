import { describe, expect, it } from 'vitest';
import { isNewerVersion } from './version.ts';

describe('isNewerVersion', () => {
  it('compares each part as a number, the major first', () => {
    expect(isNewerVersion('0.2.0', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.10.0', '0.9.3')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
  });

  it('is never newer when the same or older', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.9.9', '0.10.0')).toBe(false);
  });

  it('is never newer when either does not read as major.minor.patch', () => {
    expect(isNewerVersion('v0.2.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.2', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.2.0', 'edge')).toBe(false);
    expect(isNewerVersion('0.2.0-beta.1', '0.1.0')).toBe(false);
  });
});
