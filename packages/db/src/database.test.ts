import { createTestDatabase } from '@toppo-tracker/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from './database.ts';

describe('createDatabase (PostgreSQL)', () => {
  let database: Database;

  beforeAll(async () => {
    database = createDatabase({ url: (await createTestDatabase()).url, maxConnections: 2 });
  });

  afterAll(async () => {
    await database.close();
  });

  it('answers a ping', async () => {
    await expect(database.ping()).resolves.toBeUndefined();
  });

  it('plans every run of a statement with its own values', async () => {
    const [setting] = await database.db.execute<{ mode: string }>(
      sql`select current_setting('plan_cache_mode') as mode`,
    );

    expect(setting?.mode).toBe('force_custom_plan');
  });

  it('rejects a ping when the server is unreachable', async () => {
    const unreachable = createDatabase({ url: 'postgres://toppo:toppo@127.0.0.1:1/toppo' });
    try {
      await expect(unreachable.ping()).rejects.toThrow();
    } finally {
      await unreachable.close();
    }
  });
});
