/**
 * Playwright starts its web server before any global setup, so the database is prepared here
 * first: every local run starts from a fresh, never set up instance. Skipped when testing an
 * external instance (CI runs the Docker image with fresh volumes).
 */
import { ensurePostgres, recreateDatabase } from '@toppo-tracker/testing';
import { E2E_DATABASE } from './playwright.config.ts';

if (!process.env['E2E_BASE_URL']) {
  await ensurePostgres();
  await recreateDatabase(E2E_DATABASE);
}
