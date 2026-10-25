import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { testDatabaseUrl } from '@toppo/testing';

/**
 * The screenshots of the documentation (`npm run docs:screenshots`): the locally built server on
 * a fresh database of its own, filled as a team would, then photographed into `docs/images/`.
 */
const PORT = 3150;
export const SCREENSHOTS_DATABASE = 'toppo_screenshots';
export const SCREENSHOTS_SETUP_CODE = 'SHOT-SHOT-SHOT';
export const SCREENSHOTS_FOLDER = fileURLToPath(new URL('../../docs/images/', import.meta.url));
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: '.',
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'en-US',
    timezoneId: 'Europe/Paris',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'node ../../apps/server/dist/main.js',
    url: `${baseURL}/health`,
    reuseExistingServer: false,
    env: {
      TOPPO_DATABASE_URL: testDatabaseUrl(SCREENSHOTS_DATABASE),
      TOPPO_HOST: '127.0.0.1',
      TOPPO_PORT: String(PORT),
      TOPPO_URL: baseURL,
      TOPPO_LOG_LEVEL: 'warn',
      TOPPO_DATA_DIR: fileURLToPath(new URL('../.data/screenshots', import.meta.url)),
      TOPPO_SETUP_CODE: SCREENSHOTS_SETUP_CODE,
    },
  },
});
