import { fileURLToPath } from 'node:url';
import {
  ISSUE_ACTIVITY_PAYLOADS,
  type IssueActivityType,
  PROPERTY_VALUE_SCHEMAS,
  type PropertyType,
} from '@toppo/shared';
import { readSnapshots, restoreSnapshot } from '@toppo/testing';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS_FOLDER } from '../vitest.global-setup.ts';
import { createDatabase, type Database } from './database.ts';
import { activities, issues, properties } from './schema/index.ts';

const SNAPSHOTS = fileURLToPath(new URL('../snapshots', import.meta.url));

/** Restoring a version's database, then every migration that came after it. */
const UPGRADING_TIMEOUT_MS = 60_000;

async function migrate(url: string, migrationsFolder: string): Promise<void> {
  const database = createDatabase({ url, maxConnections: 1 });
  try {
    await database.migrate(migrationsFolder);
  } finally {
    await database.close();
  }
}

const snapshots = await readSnapshots(SNAPSHOTS);

/** Whether a stored activity's payload still reads as its type says. */
const readsAsItsType = ({ type, payload }: { type: string; payload: unknown }) =>
  type in ISSUE_ACTIVITY_PAYLOADS &&
  ISSUE_ACTIVITY_PAYLOADS[type as IssueActivityType].safeParse(payload).success;

describe.each(snapshots)('a database of $name, upgraded', (snapshot) => {
  let database: Database;

  beforeAll(async () => {
    const restored = await restoreSnapshot(snapshot, MIGRATIONS_FOLDER, migrate);
    database = createDatabase({ url: restored.url, maxConnections: 2 });
    await database.migrate(MIGRATIONS_FOLDER);
  }, UPGRADING_TIMEOUT_MS);

  afterAll(async () => {
    await database.close();
  });

  it('keeps every row it had', async () => {
    const lost: string[] = [];
    for (const [table, rows] of Object.entries(snapshot.tables)) {
      const ids = rows.flatMap(({ id }) =>
        typeof id === 'string' || typeof id === 'number' ? [String(id)] : [],
      );
      const [kept] = await database.db.execute<{ count: string }>(
        ids.length === rows.length
          ? sql`select count(*) as count from ${sql.identifier(table)} where id::text = any(${sql.param(ids)})`
          : sql`select count(*) as count from ${sql.identifier(table)}`,
      );
      if (Number(kept?.count) < rows.length) {
        lost.push(`${table}: ${rows.length - Number(kept?.count)} of ${rows.length}`);
      }
    }

    expect(lost).toStrictEqual([]);
  });

  it('still reads what it stored', async () => {
    const stored = await database.db
      .select({ type: activities.type, payload: activities.payload })
      .from(activities);
    expect(stored.filter((activity) => !readsAsItsType(activity))).toStrictEqual([]);

    const types = new Map(
      (await database.db.select({ id: properties.id, type: properties.type }).from(properties)).map(
        ({ id, type }) => [id, type as PropertyType],
      ),
    );
    const values = (
      await database.db.select({ properties: issues.properties }).from(issues)
    ).flatMap((issue) => Object.entries(issue.properties));
    expect(values.length).toBeGreaterThan(0);
    const unread = values.filter(([propertyId, value]) => {
      const type = types.get(propertyId);
      return !(type && PROPERTY_VALUE_SCHEMAS[type].safeParse(value).success);
    });
    expect(unread).toStrictEqual([]);
  });
});
