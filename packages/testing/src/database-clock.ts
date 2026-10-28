import { withMaintenanceConnection } from './postgres-server.ts';

/** The database's clock and this machine's, read at the same instant. */
export interface ClockReading {
  hostMs: number;
  databaseMs: number;
}

/** Past this gap between the clocks, tests comparing a row's time with now fail. */
const SKEW_MS = 1000;
/** Past this pace between readings, rows written in a row are dated out of order. */
const DRIFT_RATIO = 0.05;
/** Readings closer than this tell nothing of a pace: the round trip weighs too much. */
const DRIFT_SPAN_MS = 1000;

export async function readDatabaseClock(): Promise<ClockReading> {
  return await withMaintenanceConnection(async (sql) => {
    const before = Date.now();
    const [row] = await sql<{ now: Date }[]>`select clock_timestamp() as now`;
    const after = Date.now();
    if (!row) {
      throw new Error('PostgreSQL did not tell its time');
    }
    // The database read its clock somewhere during the round trip: its middle is the best guess.
    return { hostMs: (before + after) / 2, databaseMs: row.now.getTime() };
  });
}

/**
 * What to tell whoever runs the tests when the database's clock is not this machine's, if
 * anything. A virtual machine's clock (Docker Desktop's, under WSL 2) may drift, then be stepped
 * back: `now()` goes backwards, and tests that order rows by time fail at random.
 */
export function clockWarning(first: ClockReading, last: ClockReading): string | null {
  const skewMs = [first, last]
    .map(({ hostMs, databaseMs }) => databaseMs - hostMs)
    .reduce((widest, skew) => (Math.abs(skew) > Math.abs(widest) ? skew : widest));
  const spanMs = last.hostMs - first.hostMs;
  const countedMs = last.databaseMs - first.databaseMs;
  const seconds = (ms: number) => `${(Math.abs(ms) / 1000).toFixed(1)} s`;
  const problems = [
    ...(Math.abs(skewMs) > SKEW_MS
      ? [`is ${seconds(skewMs)} ${skewMs > 0 ? 'ahead of' : 'behind'} this machine's`]
      : []),
    ...(spanMs >= DRIFT_SPAN_MS && Math.abs(countedMs / spanMs - 1) > DRIFT_RATIO
      ? [
          `counted ${countedMs < 0 ? '-' : ''}${seconds(countedMs)} while ${seconds(spanMs)} passed here`,
        ]
      : []),
  ];
  if (problems.length === 0) {
    return null;
  }
  return [
    `Warning: the test database's clock ${problems.join(' and ')}.`,
    'Tests that compare times, or order rows by them, may fail at random.',
    'Restart Docker (on Windows: `wsl --shutdown`, then Docker Desktop) and run them again.',
  ].join('\n');
}

/**
 * Reads the database's clock as a test run starts, and answers what to call as it ends: a
 * warning, without failing, when the clocks did not keep time together meanwhile. A whole run
 * is long enough to tell a drift from a slow round trip.
 */
export async function watchDatabaseClock(): Promise<() => Promise<void>> {
  const start = await readDatabaseClock();
  return async () => {
    const warning = clockWarning(start, await readDatabaseClock());
    if (warning) {
      process.stderr.write(`\n${warning}\n\n`);
    }
  };
}
