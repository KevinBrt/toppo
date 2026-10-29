import type { z } from 'zod';
import type { HOST_CALLS, RecordData } from './protocol/calls.ts';
import type { RecordGroup } from './protocol/entities.ts';

/** What a plugin's records hang on: an issue (seen as it is), or a project. */
export type Attachment = 'issue' | 'project';

/** Records a plugin keeps, as `defineEntity` declares them. */
export interface Entity<A extends Attachment = Attachment, F extends z.ZodObject = z.ZodObject> {
  readonly attachedTo: A;
  readonly fields: F;
  readonly limits: { readonly perIssue?: number; readonly perProject?: number };
}

/**
 * Declares what a plugin keeps: records on an issue or a project, with fields Toppo checks
 * itself, and the most of them an issue (or a project, for those on no issue) may hold.
 */
export function defineEntity<const A extends Attachment, F extends z.ZodObject>(definition: {
  attachedTo: A;
  fields: F;
  limits?: A extends 'issue' ? { perIssue?: number } : { perProject?: number };
}): Entity<A, F> {
  return {
    attachedTo: definition.attachedTo,
    fields: definition.fields,
    limits: definition.limits ?? {},
  };
}

/** A record as a plugin reads it: where it hangs, who wrote it and when, then its fields. */
export type EntityRecord<En extends Entity> = {
  readonly id: string;
  readonly issueId: En['attachedTo'] extends 'issue'
    ? string
    : En['attachedTo'] extends 'project'
      ? null
      : string | null;
  readonly projectId: string;
  readonly createdBy: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
} & z.output<En['fields']>;

/** Where a new record hangs. */
type AnchorOf<A extends Attachment> = A extends 'issue'
  ? { issueId: string }
  : { projectId: string };

/** Which records: on an issue, in a project, written by someone; all it sees otherwise. */
export interface RecordWhere {
  issueId?: string;
  projectId?: string;
  createdBy?: string;
}

/** A count or a sum of a group: its issue, project or author, `null` for none. */
export interface RecordGroupTotal {
  key: string | null;
  value: number;
}

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
  /** A page of them, newest first unless said: 50 by default, 100 at most. */
  list(query?: {
    where?: RecordWhere;
    order?: 'newest' | 'oldest';
    page?: number;
    pageSize?: number;
  }): Promise<{ items: EntityRecord<En>[]; total: number }>;
  count(query?: { where?: RecordWhere }): Promise<number>;
  /** By issue, project or author: the largest first, 1,000 groups at most. */
  countBy(groupBy: RecordGroup, query?: { where?: RecordWhere }): Promise<RecordGroupTotal[]>;
  sum(
    field: NumberFieldOf<z.output<En['fields']>>,
    query?: { where?: RecordWhere },
  ): Promise<number>;
  sumBy(
    field: NumberFieldOf<z.output<En['fields']>>,
    groupBy: RecordGroup,
    query?: { where?: RecordWhere },
  ): Promise<RecordGroupTotal[]>;
}

type EntityMethod = Extract<keyof typeof HOST_CALLS, `entities.${string}`>;

/** What the client asks Toppo: one of its calls about records, answered checked. */
export type EntityCaller = <M extends EntityMethod>(
  method: M,
  args: z.input<(typeof HOST_CALLS)[M]['args']>,
) => Promise<z.output<(typeof HOST_CALLS)[M]['result']>>;

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
    groupBy: RecordGroup | undefined,
    where: RecordWhere | undefined,
  ) =>
    await call('entities.aggregate', {
      entity: name,
      op,
      ...(field === undefined ? {} : { field }),
      ...(groupBy === undefined ? {} : { groupBy }),
      ...(where === undefined ? {} : { where }),
    });
  const client: EntityClient<Entity> = {
    async create(input) {
      const { issueId, projectId, ...fields } = input as Record<string, unknown>;
      return read(
        await call('entities.create', {
          entity: name,
          ...(typeof issueId === 'string' ? { issueId } : {}),
          ...(typeof projectId === 'string' ? { projectId } : {}),
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
    async list(query = {}) {
      const page = await call('entities.list', { entity: name, ...query });
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
