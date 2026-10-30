import { RECORD_SLOTS } from '@toppo-tracker/db';
import { ENTITY_INDEXES_MAX, type EntityField } from '@toppo-tracker/plugin-sdk/protocol';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { setupTestDatabase } from '../../../../test-helpers.ts';
import { slotValueOf } from './record-slots.util.ts';

const context = setupTestDatabase();

/** What a slot keeps of `value`, a record's field declared as `declared`. */
async function kept(declared: EntityField, value: unknown): Promise<unknown> {
  const data = sql`${JSON.stringify(value === undefined ? {} : { field: value })}::jsonb`;
  const [row] = await context.database.db.execute<{ kept: unknown }>(
    sql`select ${slotValueOf(data, 'field', declared)} as kept`,
  );
  return row?.kept;
}

describe('the slots of a record', () => {
  it('are as many of each kind as an entity may index', () => {
    expect(
      Object.fromEntries(Object.entries(RECORD_SLOTS).map(([kind, slots]) => [kind, slots.length])),
    ).toStrictEqual(ENTITY_INDEXES_MAX);
  });

  it('keep each kind of field typed: a date at midnight UTC, a moment, a number, a text, an id', async () => {
    const id = '01a1569b-9900-7000-8000-000000000001';

    expect(await kept({ type: 'string', format: 'date' }, '2026-10-28')).toStrictEqual(
      new Date('2026-10-28T00:00:00Z').toISOString().replace('T', ' ').replace('.000Z', '+00'),
    );
    expect(
      await kept({ type: 'string', format: 'date-time' }, '2026-10-28T09:30:00+02:00'),
    ).toStrictEqual('2026-10-28 07:30:00+00');
    expect(await kept({ type: 'number' }, 22.5)).toBe('22.5');
    expect(await kept({ type: 'string', enum: ['work', 'meeting'] }, 'work')).toBe('work');
    expect(await kept({ type: 'string', format: 'uuid' }, id)).toBe(id);
  });

  it('take the field’s default for a record written before it was', async () => {
    expect(await kept({ type: 'string', enum: ['work'], default: 'work' }, undefined)).toBe('work');
    expect(await kept({ type: 'integer', default: 0 }, undefined)).toBe('0');
    expect(await kept({ type: 'integer' }, undefined)).toBeNull();
  });

  it('keep nothing, and never fail, for a value an upgrade left of another type', async () => {
    const number: EntityField = { type: 'number' };
    const date: EntityField = { type: 'string', format: 'date' };

    expect(await kept(number, 'many')).toBeNull();
    expect(await kept(number, '12')).toBeNull();
    expect(await kept(date, '2026-02-30')).toBeNull();
    expect(await kept(date, 20_261_028)).toBeNull();
    expect(await kept(date, '20261028')).toBeNull();
    expect(await kept(date, 'today')).toBeNull();
    expect(await kept({ type: 'string', format: 'date-time' }, 'yesterday')).toBeNull();
    expect(await kept({ type: 'string', format: 'date-time' }, 'infinity')).toBeNull();
    expect(await kept({ type: 'string', format: 'uuid' }, 'ada')).toBeNull();
    expect(await kept({ type: 'string', maxLength: 200 }, 'x'.repeat(321))).toBeNull();
    expect(await kept({ type: 'string', maxLength: 200 }, { nested: true })).toBeNull();
  });
});
