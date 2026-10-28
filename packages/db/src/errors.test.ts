import { createTestDatabase } from '@toppo-tracker/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.ts';
import { isUniqueViolation } from './errors.ts';
import { projects } from './schema/index.ts';

describe('isUniqueViolation', () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 1 });
  });

  afterAll(async () => {
    await database.close();
  });

  it('recognizes a duplicate under the named constraint, through Drizzle’s wrapping', async () => {
    await database.db.insert(projects).values({ key: 'WEB', name: 'Website' });
    const error = await database.db
      .insert(projects)
      .values({ key: 'WEB', name: 'Again' })
      .catch((caught: unknown) => caught);

    expect(isUniqueViolation(error, 'projects_key_unique')).toBe(true);
    expect(isUniqueViolation(error, 'roles_name_unique')).toBe(false);
  });

  it('answers no for anything else', async () => {
    const error = await database.db
      .insert(projects)
      .values({ key: 'bad key', name: 'Bad' })
      .catch((caught: unknown) => caught);

    expect(isUniqueViolation(error, 'projects_key_unique')).toBe(false);
    expect(isUniqueViolation(new Error('plain'), 'projects_key_unique')).toBe(false);
    expect(isUniqueViolation('not an error', 'projects_key_unique')).toBe(false);
  });
});
