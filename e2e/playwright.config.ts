import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from '@toppo-tracker/testing';

const isCI = Boolean(process.env['CI']);

/**
 * Two ways to run:
 * - `E2E_BASE_URL` and `E2E_SETUP_CODE` set (CI): tests the Docker image started with
 *   docker/docker-compose.yml, using the setup code read from its logs.
 * - otherwise: starts the locally built server (`npm run build` first) on port 3100, on a
 *   fresh database, with a known setup code.
 */
const externalBaseUrl = process.env['E2E_BASE_URL'];
const LOCAL_PORT = 3100;
const LOCAL_SETUP_CODE = 'E2E0-LOCA-LRUN';
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${LOCAL_PORT}`;

export const E2E_DATABASE = 'toppo_e2e';
export const SETUP_CODE = process.env['E2E_SETUP_CODE'] ?? LOCAL_SETUP_CODE;
/** Session of the administrator created by the setup project, reused by the other projects. */
export const ADMIN_STORAGE_STATE = fileURLToPath(new URL('.auth/admin.json', import.meta.url));

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  // Each worker is a browser of its own: six run the journeys nearly as fast as one per two cores
  // (Playwright's default), without taking the whole machine. Never more than that default.
  workers: Math.max(1, Math.min(6, Math.floor(availableParallelism() / 2))),
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // The first-run wizard, exactly as a new user goes through it.
    { name: 'setup', testMatch: /first-run\.setup\.ts/, use: { ...devices['Desktop Chrome'] } },
    // Device-specific tests are tagged instead of skipped at runtime.
    {
      name: 'desktop',
      dependencies: ['setup'],
      grepInvert: /@mobile-only|@instance/,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      grepInvert: /@desktop-only|@instance/,
      use: { ...devices['Pixel 7'], storageState: ADMIN_STORAGE_STATE },
    },
    // Tests that change what every other test reads (the instance's workflow, its default
    // category) run once the others are done, one at a time: an issue created meanwhile would
    // get their temporary status or category.
    {
      name: 'instance',
      dependencies: ['desktop', 'mobile'],
      grep: /@instance/,
      workers: 1,
      use: { ...devices['Desktop Chrome'], storageState: ADMIN_STORAGE_STATE },
    },
  ],
  ...(externalBaseUrl
    ? {}
    : {
        webServer: {
          command: 'node --enable-source-maps ../apps/server/dist/main.js',
          url: `${baseURL}/health`,
          reuseExistingServer: false,
          env: {
            TOPPO_DATABASE_URL: testDatabaseUrl(E2E_DATABASE),
            TOPPO_HOST: '127.0.0.1',
            TOPPO_PORT: String(LOCAL_PORT),
            TOPPO_URL: baseURL,
            TOPPO_LOG_LEVEL: 'warn',
            TOPPO_DATA_DIR: fileURLToPath(new URL('.data', import.meta.url)),
            TOPPO_SETUP_CODE: LOCAL_SETUP_CODE,
            TOPPO_UPDATE_CHECK: 'false',
          },
        },
      }),
});
