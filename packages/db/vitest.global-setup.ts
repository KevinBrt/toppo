import { fileURLToPath } from 'node:url';
import { prepareTemplateDatabase, removeTestDatabases } from '@toppo-tracker/testing';
import type { TestProject } from 'vitest/node';
import { createDatabase } from './src/database.ts';

export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

/** Prepares the template each test file clones; the teardown it hands back drops them all. */
export async function setup(project: TestProject): Promise<() => Promise<void>> {
  const template = await prepareTemplateDatabase({
    name: 'toppo_test_db',
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
  return () => removeTestDatabases(template);
}
