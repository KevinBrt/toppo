import type { z } from 'zod';
import { type HOST_CALLS, type RecordData, recordWhereSchema } from './protocol/calls.ts';
import { RECORD_GROUPS, type RecordGroup } from './protocol/declarations/entities.ts';

/** What a plugin's records hang on: an issue (seen as it is), a project, or a person. */
export type Attachment = 'issue' | 'project' | 'person';

/**
 * Who sees the records on a person, besides the plugin itself: that person only, or also those
 * who share with them a project the plugin acts in.
 */
export type PersonVisibility = 'person' | 'teammates';

/** Records a plugin keeps, as `defineEntity` declares them. */
export interface Entity<
  A extends Attachment = Attachment,
  F extends z.ZodObject = z.ZodObject,
  I extends string = string,
> {
  readonly attachedTo: A;
  /** On a person: who sees its records; that person only unless said. */
  readonly visibleTo?: PersonVisibility | undefined;
  readonly fields: F;
  /** The fields its records are filtered, sorted and grouped on. */
  readonly indexes: readonly I[];
  readonly limits: {
    readonly perIssue?: number;
    readonly perProject?: number;
    readonly perPerson?: number;
  };
}

/** The bound of an entity's records: by issue, by project, or by person, as they hang. */
type LimitsOf<A extends Attachment> = A extends 'issue'
  ? { perIssue?: number }
  : A extends 'project'
    ? { perProject?: number }
    : { perPerson?: number };

/**
 * The fields an index takes: a number, a date, an id, a choice or a short text, which no record
 * lacks. Toppo checks the rest (a text's length, how many of a kind) when the plugin is built.
 */
type IndexableField<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : T[K] extends string | number ? K : never;
}[keyof T] &
  string;

/**
 * Declares what a plugin keeps: records on an issue, a project or a person, with fields Toppo
 * checks itself, those it filters, sorts and groups them on (`indexes`), and the most of them an
 * issue (or a project, for those on no issue, or a person) may hold. Records on a person are seen
 * by that person only, unless `visibleTo: 'teammates'`; they ask for plugin API ^1.1.
 */
export function defineEntity<
  const A extends Attachment,
  F extends z.ZodObject,
  const I extends IndexableField<z.output<F>> = never,
>(definition: {
  attachedTo: A;
  visibleTo?: A extends 'person' ? PersonVisibility : never;
  fields: F;
  indexes?: readonly I[];
  limits?: LimitsOf<A>;
}): Entity<A, F, I> {
  return {
    attachedTo: definition.attachedTo,
    ...(definition.visibleTo === undefined ? {} : { visibleTo: definition.visibleTo }),
    fields: definition.fields,
    indexes: definition.indexes ?? [],
    limits: definition.limits ?? {},
  };
}

type FieldsOf<En extends Entity> = z.output<En['fields']>;

type IndexOf<En extends Entity> = En['indexes'][number];

/** Where a record hangs, as it reads: an issue in its project, a project, or a person. */
type AnchorsOf<A extends Attachment> = [A] extends ['issue']
  ? { readonly issueId: string; readonly projectId: string; readonly personId: null }
  : [A] extends ['project']
    ? { readonly issueId: null; readonly projectId: string; readonly personId: null }
    : [A] extends ['person']
      ? { readonly issueId: null; readonly projectId: null; readonly personId: string }
      : {
          readonly issueId: string | null;
          readonly projectId: string | null;
          readonly personId: string | null;
        };

/** A record as a plugin reads it: where it hangs, who wrote it and when, then its fields. */
export type EntityRecord<En extends Entity> = {
  readonly id: string;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
} & AnchorsOf<En['attachedTo']> &
  FieldsOf<En>;

/** Where a new record hangs. */
type AnchorOf<A extends Attachment> = A extends 'issue'
  ? { issueId: string }
  : A extends 'project'
    ? { projectId: string }
    : { personId: string };

/** What an indexed field must be: a value, one of a list (100 at most), or within bounds. */
export type FieldCondition<V> =
  | V
  | { readonly in: readonly V[] }
  | { readonly gt?: V; readonly gte?: V; readonly lt?: V; readonly lte?: V };

/**
 * Which records: on an issue, in a project, on a person, written by someone, with indexed fields
 * as said; all it sees otherwise.
 */
export type RecordWhere<En extends Entity = Entity> = {
  readonly issueId?: string;
  readonly projectId?: string;
  readonly personId?: string;
  readonly createdBy?: string;
} & { readonly [K in IndexOf<En>]?: FieldCondition<FieldsOf<En>[K]> };

/** What records are grouped by: their issue, project, person or author, or an indexed field. */
type GroupOf<En extends Entity> = RecordGroup | IndexOf<En>;

/** A count or a sum of a group: its id (`null` for none), or the value of its field. */
export interface RecordGroupTotal<K = string | number | null> {
  readonly key: K;
  readonly value: number;
}

type GroupKeyOf<En extends Entity, G> = G extends RecordGroup
  ? string | null
  : G extends keyof FieldsOf<En>
    ? FieldsOf<En>[G]
    : never;

type NumberFieldOf<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends number ? K : never;
}[keyof T] &
  string;

/** What a plugin does with the records of one of its entities, as far as it sees them. */
export interface EntityClient<En extends Entity> {
  /** Checked by its schema, then by Toppo, which refuses past the entity's limits. */
  create(input: z.input<En['fields']> & AnchorOf<En['attachedTo']>): Promise<EntityRecord<En>>;
  /** `null` for a record that is not there, or not seen. */
  get(id: string): Promise<EntityRecord<En> | null>;
  /** The fields given replace those it had; the others stay. */
  update(id: string, changes: Partial<z.input<En['fields']>>): Promise<EntityRecord<En>>;
  delete(id: string): Promise<void>;
  /**
   * A page of them, the latest written first unless sorted on an indexed field: 50 by default,
   * 100 at most.
   */
  list(query?: {
    where?: RecordWhere<En>;
    orderBy?: 'createdAt' | IndexOf<En>;
    direction?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<{ items: EntityRecord<En>[]; total: number }>;
  count(query?: { where?: RecordWhere<En> }): Promise<number>;
  /** By issue, project, person, author or indexed field: the largest first, 1,000 at most. */
  countBy<G extends GroupOf<En>>(
    groupBy: G,
    query?: { where?: RecordWhere<En> },
  ): Promise<RecordGroupTotal<GroupKeyOf<En, G>>[]>;
  sum(field: NumberFieldOf<FieldsOf<En>>, query?: { where?: RecordWhere<En> }): Promise<number>;
  sumBy<G extends GroupOf<En>>(
    field: NumberFieldOf<FieldsOf<En>>,
    groupBy: G,
    query?: { where?: RecordWhere<En> },
  ): Promise<RecordGroupTotal<GroupKeyOf<En, G>>[]>;
}

type EntityMethod = Extract<keyof typeof HOST_CALLS, `entities.${string}`>;

/** What the client asks Toppo: one of its calls about records, answered checked. */
export type EntityCaller = <M extends EntityMethod>(
  method: M,
  args: z.input<(typeof HOST_CALLS)[M]['args']>,
) => Promise<z.output<(typeof HOST_CALLS)[M]['result']>>;

/** The client of any entity, as the SDK writes it once: typed for each entity by its caller. */
interface AnyEntityClient {
  create(input: Record<string, unknown>): Promise<EntityRecord<Entity>>;
  get(id: string): Promise<EntityRecord<Entity> | null>;
  update(id: string, changes: Record<string, unknown>): Promise<EntityRecord<Entity>>;
  delete(id: string): Promise<void>;
  list(query?: {
    where?: RecordWhere;
    orderBy?: string;
    direction?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }): Promise<{ items: EntityRecord<Entity>[]; total: number }>;
  count(query?: { where?: RecordWhere }): Promise<number>;
  countBy(groupBy: string, query?: { where?: RecordWhere }): Promise<RecordGroupTotal[]>;
  sum(field: string, query?: { where?: RecordWhere }): Promise<number>;
  sumBy(
    field: string,
    groupBy: string,
    query?: { where?: RecordWhere },
  ): Promise<RecordGroupTotal[]>;
}

/** A plugin's `where`, as Toppo takes it: the anchors, then the indexed fields apart. */
function whereOf(where: RecordWhere = {}): z.output<typeof recordWhereSchema> {
  const anchors: Record<string, unknown> = {};
  const fields: Record<string, unknown> = {};
  for (const [key, condition] of Object.entries(where)) {
    if (condition !== undefined) {
      ((RECORD_GROUPS as readonly string[]).includes(key) ? anchors : fields)[key] = condition;
    }
  }
  return recordWhereSchema.parse(Object.keys(fields).length > 0 ? { ...anchors, fields } : anchors);
}

/**
 * The records of entity `name`, through Toppo: what is written is checked by the plugin's own
 * schema first, what is read parsed by it, so that a record an upgrade no longer reads says so.
 */
export function createEntityClient<En extends Entity>(
  call: EntityCaller,
  name: string,
  entity: En,
): EntityClient<En> {
  const read = (record: RecordData): EntityRecord<Entity> => {
    const fields = entity.fields.safeParse(record.fields);
    if (!fields.success) {
      throw new Error(`The record ${record.id} of ${name} does not fit this version`);
    }
    const { fields: _fields, ...anchors } = record;
    return { ...anchors, ...fields.data };
  };
  const aggregate = async (
    op: 'count' | 'sum',
    field: string | undefined,
    groupBy: string | undefined,
    where: RecordWhere | undefined,
  ) =>
    await call('entities.aggregate', {
      entity: name,
      op,
      ...(field === undefined ? {} : { field }),
      ...(groupBy === undefined ? {} : { groupBy }),
      where: whereOf(where),
    });
  const client: AnyEntityClient = {
    async create(input) {
      const { issueId, projectId, personId, ...fields } = input;
      return read(
        await call('entities.create', {
          entity: name,
          ...(typeof issueId === 'string' ? { issueId } : {}),
          ...(typeof projectId === 'string' ? { projectId } : {}),
          ...(typeof personId === 'string' ? { personId } : {}),
          fields: entity.fields.parse(fields),
        }),
      );
    },
    async get(id) {
      const record = await call('entities.get', { entity: name, id });
      return record === null ? null : read(record);
    },
    async update(id, changes) {
      const fields = entity.fields.partial().parse(changes);
      return read(await call('entities.update', { entity: name, id, fields }));
    },
    async delete(id) {
      await call('entities.delete', { entity: name, id });
    },
    async list({ where, ...query } = {}) {
      const page = await call('entities.list', { entity: name, where: whereOf(where), ...query });
      return { items: page.items.map(read), total: page.total };
    },
    async count(query = {}) {
      return (await aggregate('count', undefined, undefined, query.where)).total;
    },
    async countBy(groupBy, query = {}) {
      return (await aggregate('count', undefined, groupBy, query.where)).groups ?? [];
    },
    async sum(field, query = {}) {
      return (await aggregate('sum', field, undefined, query.where)).total;
    },
    async sumBy(field, groupBy, query = {}) {
      return (await aggregate('sum', field, groupBy, query.where)).groups ?? [];
    },
  };
  // Toppo answers the records of this very entity: they are what it declares.
  return client as unknown as EntityClient<En>;
}
