import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./vitest.global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-helpers.ts', 'src/main.ts', 'src/healthcheck.ts'],
      thresholds: { lines: 85, functions: 85, branches: 85, statements: 85 },
    },
  },
});
