import { availableParallelism } from 'node:os';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Eight files at once, as many as the cores Docker gives PostgreSQL here: a few seconds slower
    // than one per core, but the machine stays usable and its database is not swamped while the
    // other suites run. Never more than Vitest's default, one fewer than the cores.
    maxWorkers: Math.max(1, Math.min(8, availableParallelism() - 1)),
    globalSetup: ['./vitest.global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Bundled by the tests and run in the sandbox, never imported by Node.
        'src/**/*.fixture.ts',
        'src/test-helpers.ts',
        'src/main.ts',
        'src/healthcheck.ts',
      ],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
