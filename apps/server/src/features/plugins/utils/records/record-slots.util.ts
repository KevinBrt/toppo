import { isDeepStrictEqual } from 'node:util';
import {
  ALL_RECORD_SLOTS,
  type Db,
  RECORD_SLOTS,
  type RecordSlot,
  schema,
} from '@toppo-tracker/db';
import {
  type EntityDeclaration,
  type EntityField,
  entityFieldSchema,
  indexKindOf,
  type Manifest,
} from '@toppo-tracker/plugin-sdk/protocol';
import { and, eq, gt, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import type { Transaction } from '../../../../platform/cqrs/cqrs.ts';

const { pluginRecords, pluginRecordSlots } = schema;

/** A field an entity indexes, with the slot of `plugin_records` that holds it. */
export interface IndexedField {
  readonly field: string;
  readonly slot: RecordSlot;
  readonly declared: EntityField;
  /** Read from its slot once every record has it there; from their data meanwhile. */
  readonly filled: boolean;
}

/**
 * Holds the slots of a plugin's records as they are: shared by its writes, which copy fields to
 * the slots they read, exclusive as the slots are given again. A write never copies to a slot
 * given meanwhile, which the job that fills it may have passed already.
 */
async function lockSlots(
  tx: Transaction,
  pluginSlug: string,
  mode: 'shared' | 'exclusive',
): Promise<void> {
  const key = sql`hashtextextended(${`plugin-record-slots:${pluginSlug}`}, 0)`;
  await tx.execute(
    mode === 'shared'
      ? sql`select pg_advisory_xact_lock_shared(${key})`
      : sql`select pg_advisory_xact_lock(${key})`,
  );
}

/** The fields `entity` indexes, with their slots, held as they are until the write commits. */
export async function slotsToWrite(
  tx: Transaction,
  pluginSlug: string,
  name: string,
  entity: EntityDeclaration,
): Promise<IndexedField[]> {
  await lockSlots(tx, pluginSlug, 'shared');
  return await indexedFieldsOf(tx, pluginSlug, name, entity);
}

/** The fields `entity` indexes, with their slots. */
export async function indexedFieldsOf(
  db: Pick<Db, 'select'>,
  pluginSlug: string,
  name: string,
  entity: EntityDeclaration,
): Promise<IndexedField[]> {
  const rows = await db
    .select({
      field: pluginRecordSlots.field,
      slot: pluginRecordSlots.slot,
      filledAt: pluginRecordSlots.filledAt,
    })
    .from(pluginRecordSlots)
    .where(and(eq(pluginRecordSlots.pluginSlug, pluginSlug), eq(pluginRecordSlots.entity, name)));
  return rows.flatMap(({ field, slot, filledAt }) => {
    // Given as the plugin was installed: each field it indexes has its slot, and only those.
    const declared = Object.hasOwn(entity.fields.properties, field)
      ? entity.fields.properties[field]
      : undefined;
    return declared ? [{ field, slot, declared, filled: filledAt !== null }] : [];
  });
}

/** `data -> field` when it is a JSON value of `type`, as text; `null` otherwise. */
function textOf(data: SQL, field: string, type: 'string' | 'number'): SQL {
  return sql`case when jsonb_typeof(${data} -> ${field}) = ${type} then ${data} ->> ${field} end`;
}

/**
 * The shape of what PostgreSQL may read as each type: it would also read `today` or `infinity`
 * as a date, which Toppo never writes.
 */
const SHAPES = {
  date: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$',
  timestamptz: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T',
  uuid: '^[0-9A-Fa-f-]{36}$',
} as const;

/** A JSON text as text, when PostgreSQL reads it as a value of `type`. */
function validAs(data: SQL, field: string, type: keyof typeof SHAPES): SQL {
  const text = textOf(data, field, 'string');
  return sql`case when ${text} ~ ${SHAPES[type]} and pg_input_is_valid(${text}, ${type}) then ${text} end`;
}

/**
 * The value of `field` in `data` (JSON of a record's fields), as its slot keeps it: a date at
 * midnight UTC, a moment, a number, a text, an id. `null` for a value of another type, which a
 * field changed by an upgrade leaves in records written before: never an error.
 */
function convertedValueOf(data: SQL, field: string, declared: EntityField): SQL | null {
  switch (indexKindOf(declared)) {
    case 'number':
      return sql`(${textOf(data, field, 'number')})::numeric`;
    case 'date':
      return 'format' in declared && declared.format === 'date'
        ? sql`((${validAs(data, field, 'date')})::date)::timestamp at time zone 'UTC'`
        : sql`(${validAs(data, field, 'timestamptz')})::timestamptz`;
    case 'text':
      return sql`case when char_length(${textOf(data, field, 'string')}) <= 320 then ${data} ->> ${field} end`;
    case 'ref':
      return sql`(${validAs(data, field, 'uuid')})::uuid`;
    case undefined:
      return null;
  }
}

/**
 * The value of `field` in `data` as its slot keeps it (`convertedValueOf`), its default for a
 * record that lacks it: one written before the field was.
 */
export function slotValueOf(data: SQL, field: string, declared: EntityField): SQL {
  const value = convertedValueOf(data, field, declared) ?? sql`null`;
  if (declared.default === undefined) {
    return value;
  }
  const fallback = sql`${JSON.stringify({ [field]: declared.default })}::jsonb`;
  return sql`coalesce(${value}, ${convertedValueOf(fallback, field, declared) ?? sql`null`})`;
}

/** Every slot of a record being written: the fields its entity indexes copied, others emptied. */
export function slotWritesOf(
  indexed: readonly IndexedField[],
  fields: Record<string, unknown>,
): Record<RecordSlot, SQL | null> {
  const data = sql`${JSON.stringify(fields)}::jsonb`;
  const writes = Object.fromEntries(ALL_RECORD_SLOTS.map((slot) => [slot, null])) as Record<
    RecordSlot,
    SQL | null
  >;
  for (const { field, slot, declared } of indexed) {
    writes[slot] = slotValueOf(data, field, declared);
  }
  return writes;
}

/** How a query reads an indexed field: from its slot once filled, from the data meanwhile. */
export function indexedColumnOf({ field, slot, declared, filled }: IndexedField): SQL {
  return filled
    ? sql`${pluginRecords[slot]}`
    : slotValueOf(sql`${pluginRecords.data}`, field, declared);
}

/** An entity whose slots wait to be filled: those to say filled once every record has them. */
export interface SlotsToFill {
  entity: string;
  slotIds: string[];
}

/**
 * Gives each field the plugin's entities index a slot of `plugin_records`, as it is installed or
 * upgraded. A field declared as it was keeps its slot; the others take a free slot of their kind,
 * filled at once when there is no record yet. The slots of fields no longer indexed are freed:
 * what they hold is no longer read, and is overwritten when another field takes them. Answers
 * the entities whose slots a job must fill.
 */
export async function assignRecordSlots(
  tx: Transaction,
  manifest: Manifest,
): Promise<SlotsToFill[]> {
  await lockSlots(tx, manifest.id, 'exclusive');
  const held = await tx
    .select()
    .from(pluginRecordSlots)
    .where(eq(pluginRecordSlots.pluginSlug, manifest.id))
    .for('update');
  const stays = (row: (typeof held)[number]) => {
    const entity = Object.hasOwn(manifest.entities, row.entity)
      ? manifest.entities[row.entity]
      : undefined;
    return (
      entity?.indexes.includes(row.field) === true &&
      isDeepStrictEqual(entity.fields.properties[row.field], row.declared)
    );
  };
  const freed = held.filter((row) => !stays(row)).map((row) => row.id);
  if (freed.length > 0) {
    await tx.delete(pluginRecordSlots).where(inArray(pluginRecordSlots.id, freed));
  }
  const kept = held.filter(stays);
  const toFill: SlotsToFill[] = [];
  for (const [name, entity] of Object.entries(manifest.entities)) {
    const ofEntity = kept.filter((row) => row.entity === name);
    const added = await addSlots(tx, manifest.id, name, entity, ofEntity);
    const slotIds = [...ofEntity.filter((row) => row.filledAt === null), ...added].map(
      (row) => row.id,
    );
    if (slotIds.length > 0) {
      toFill.push({ entity: name, slotIds });
    }
  }
  return toFill;
}

/** Slots for the fields of `entity` indexed without one: those still to fill. */
async function addSlots(
  tx: Transaction,
  pluginSlug: string,
  name: string,
  entity: EntityDeclaration,
  kept: readonly { field: string; slot: RecordSlot }[],
): Promise<{ id: string }[]> {
  const taken = new Set<RecordSlot>(kept.map((row) => row.slot));
  const rows = entity.indexes
    .filter((field) => !kept.some((row) => row.field === field))
    .flatMap((field) => {
      const declared = entity.fields.properties[field];
      const kind = declared && indexKindOf(declared);
      // The manifest was checked: each indexed field is of a kind, within its slots.
      const slot = kind && RECORD_SLOTS[kind].find((free) => !taken.has(free));
      if (!(declared && slot)) {
        return [];
      }
      taken.add(slot);
      return [{ pluginSlug, entity: name, field, slot, declared }];
    });
  if (rows.length === 0) {
    return [];
  }
  const [anyRecord] = await tx
    .select({ id: pluginRecords.id })
    .from(pluginRecords)
    .where(and(eq(pluginRecords.pluginSlug, pluginSlug), eq(pluginRecords.entity, name)))
    .limit(1);
  const added = await tx
    .insert(pluginRecordSlots)
    .values(rows.map((row) => ({ ...row, filledAt: anyRecord ? null : sql`now()` })))
    .returning({ id: pluginRecordSlots.id, filledAt: pluginRecordSlots.filledAt });
  return added.filter((row) => row.filledAt === null);
}

/** At most this many records have their slots filled in one transaction. */
export const SLOTS_FILL_BATCH = 1000;

/**
 * Fills the slots of `entity` that wait for it, in the records after `after` (by id), a batch at
 * a time: from each record's data, as a write would have. Answers the last record filled, or
 * `null` once none is left.
 */
export async function fillRecordSlots(
  tx: Transaction,
  pluginSlug: string,
  name: string,
  after: string | null,
): Promise<string | null> {
  const ofEntity = and(eq(pluginRecords.pluginSlug, pluginSlug), eq(pluginRecords.entity, name));
  const waiting = await tx
    .select({
      field: pluginRecordSlots.field,
      slot: pluginRecordSlots.slot,
      declared: pluginRecordSlots.declared,
    })
    .from(pluginRecordSlots)
    .where(
      and(
        eq(pluginRecordSlots.pluginSlug, pluginSlug),
        eq(pluginRecordSlots.entity, name),
        isNull(pluginRecordSlots.filledAt),
      ),
    );
  const batch = await tx
    .select({ id: pluginRecords.id })
    .from(pluginRecords)
    .where(and(ofEntity, after === null ? undefined : gt(pluginRecords.id, after)))
    .orderBy(pluginRecords.id)
    .limit(SLOTS_FILL_BATCH);
  const last = batch.at(-1)?.id ?? null;
  if (waiting.length === 0 || last === null) {
    return null;
  }
  const data = sql`${pluginRecords.data}`;
  await tx
    .update(pluginRecords)
    .set({
      ...Object.fromEntries(
        waiting.map(({ field, slot, declared }) => [
          slot,
          // Kept from a manifest Toppo checked.
          slotValueOf(data, field, entityFieldSchema.parse(declared)),
        ]),
      ),
      // Filling a slot changes nothing the plugin reads.
      updatedAt: sql`${pluginRecords.updatedAt}`,
    })
    .where(
      inArray(
        pluginRecords.id,
        batch.map(({ id }) => id),
      ),
    );
  return batch.length < SLOTS_FILL_BATCH ? null : last;
}
