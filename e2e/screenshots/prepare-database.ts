/**
 * Playwright starts its web server before any global setup, so the database is prepared here
 * first: every run of the screenshots starts from a fresh, never set up instance.
 */
import { ensurePostgres, recreateDatabase } from '@toppo-tracker/testing';
import { SCREENSHOTS_DATABASE } from './playwright.config.ts';

await ensurePostgres();
await recreateDatabase(SCREENSHOTS_DATABASE);
