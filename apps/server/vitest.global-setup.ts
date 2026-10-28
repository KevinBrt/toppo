import { fileURLToPath } from 'node:url';
import { createDatabase } from '@toppo-tracker/db';
import {
  prepareTemplateDatabase,
  removeTestDatabases,
  watchDatabaseClock,
} from '@toppo-tracker/testing';
import type { TestProject } from 'vitest/node';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../packages/db/migrations', import.meta.url));

/**
 * Prepares the template each test file clones; the teardown it hands back drops them all, and
 * tells whether the database's clock kept time meanwhile.
 */
export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const template = await prepareTemplateDatabase({
    name: 'toppo_test_server',
    migrate: async (url) => {
      const database = createDatabase({ url, maxConnections: 1 });
      try {
        await database.migrate(MIGRATIONS_FOLDER);
      } finally {
        await database.close();
      }
    },
  });
  project.provide('testTemplateDatabase', template);
  const checkClock = await watchDatabaseClock();
  return async () => {
    await removeTestDatabases(template);
    await checkClock();
  };
}
