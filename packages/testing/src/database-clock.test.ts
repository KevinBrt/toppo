import { describe, expect, it } from 'vitest';
import { clockWarning } from './database-clock.ts';

const at = (hostMs: number, databaseMs: number) => ({ hostMs, databaseMs });

describe('the database clock', () => {
  it('says nothing of clocks that agree, within a round trip', () => {
    expect(clockWarning(at(0, 4), at(2000, 2010))).toBeNull();
    expect(clockWarning(at(0, -900), at(500, -300))).toBeNull();
  });

  it('warns of a clock ahead or behind', () => {
    expect(clockWarning(at(0, 2100), at(500, 2600))).toBe(
      [
        "Warning: the test database's clock is 2.1 s ahead of this machine's.",
        'Tests that compare times, or order rows by them, may fail at random.',
        'Restart Docker (on Windows: `wsl --shutdown`, then Docker Desktop) and run them again.',
      ].join('\n'),
    );
    expect(clockWarning(at(0, 0), at(500, -1600))).toMatch(/clock is 2\.1 s behind this machine's/);
  });

  it('warns of a clock that runs fast, or is stepped back', () => {
    expect(clockWarning(at(0, 0), at(2000, 2180))).toMatch(
      /clock counted 2\.2 s while 2\.0 s passed here\./,
    );
    expect(clockWarning(at(0, 500), at(1000, 400))).toMatch(
      /clock counted -0\.1 s while 1\.0 s passed here\./,
    );
  });

  it('tells both at once', () => {
    expect(clockWarning(at(0, 1500), at(2000, 3700))).toMatch(
      /clock is 1\.7 s ahead of this machine's and counted 2\.2 s while 2\.0 s passed here\./,
    );
  });
});
