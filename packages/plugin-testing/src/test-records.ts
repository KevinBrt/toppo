import {
  comparedValueSchemaOf,
  ENTITY_LIMITS,
  type EntityDeclaration,
  type EntityField,
  type FieldCondition,
  HOST_CALLS,
  type IssueDetails,
  type Manifest,
  RECORD_GROUPS,
  RECORD_GROUPS_MAX,
  RECORD_MAX_BYTES,
  type RecordData,
  type RecordGroup,
  recordFieldsSchemaOf,
} from '@toppo-tracker/plugin-sdk/protocol';

/** The plugin's own user, who writes what it keeps as itself. */
export const TEST_PLUGIN_USER_ID = '00000000-0000-4000-8000-000000000000';

/** Who a call is answered for: someone the plugin acts for, or the plugin itself (`null`). */
export type Reader = { id: string; sees: (issueId: string) => boolean } | null;

/** The projects someone works in: every one, or those of the issues they see. */
export type Reach = 'all' | ReadonlySet<string>;

type Kept = RecordData & { entity: string };

type Anchor = Pick<RecordData, 'issueId' | 'projectId' | 'personId'>;

/** The one anchor an entity's records take, and the limit of their number on it. */
const ANCHORS = {
  issue: { given: 'issueId', limit: 'perIssue' },
  project: { given: 'projectId', limit: 'perProject' },
  person: { given: 'personId', limit: 'perPerson' },
} as const satisfies Record<
  EntityDeclaration['attachedTo'],
  { given: keyof Anchor; limit: keyof typeof ENTITY_LIMITS }
>;

const refusal = (code: string) => new Error(code);

const GROUP_KEYS = {
  issueId: (record: Kept) => record.issueId,
  projectId: (record: Kept) => record.projectId,
  personId: (record: Kept) => record.personId,
  createdBy: (record: Kept) => record.createdBy,
} as const satisfies Record<RecordGroup, (record: Kept) => string | null>;

const isRecordGroup = (key: string): key is RecordGroup =>
  (RECORD_GROUPS as readonly string[]).includes(key);

/** A field the entity indexes; refused otherwise, as Toppo does. */
function indexedField(entity: EntityDeclaration, field: string): EntityField {
  const declared = entity.indexes.includes(field) ? entity.fields.properties[field] : undefined;
  if (!declared) {
    throw refusal('RECORD_INVALID');
  }
  return declared;
}

/** A field's value as Toppo answers and compares it: a moment in UTC. */
function comparableOf(declared: EntityField, value: unknown): string | number {
  if (typeof value === 'number') {
    return value;
  }
  const text = String(value);
  return 'format' in declared && declared.format === 'date-time'
    ? new Date(text).toISOString()
    : text;
}

const order = (left: string | number, right: string | number) =>
  left < right ? -1 : Number(left > right);

const BOUNDS = [
  ['gt', (compared: number) => compared > 0],
  ['gte', (compared: number) => compared >= 0],
  ['lt', (compared: number) => compared < 0],
  ['lte', (compared: number) => compared <= 0],
] as const;

export const worksSomewhere = (reach: Reach | undefined) =>
  reach === 'all' || (reach !== undefined && reach.size > 0);

/** Whether two people work in a project in common. */
function teammates(one: Reach | undefined, other: Reach | undefined): boolean {
  if (one === 'all' || other === 'all') {
    return worksSomewhere(one) && worksSomewhere(other);
  }
  return one !== undefined && other !== undefined && [...one].some((id) => other.has(id));
}

/** Whether a field's value meets a condition, its values checked of the field's kind first. */
function conditionOf(
  declared: EntityField,
  field: string,
  condition: FieldCondition,
): (record: Kept) => boolean {
  const checked = (given: string | number) => {
    if (!comparedValueSchemaOf(declared)?.safeParse(given).success) {
      throw refusal('RECORD_INVALID');
    }
    return comparableOf(declared, given);
  };
  const of = (record: Kept) => comparableOf(declared, record.fields[field]);
  if (typeof condition !== 'object') {
    const wanted = checked(condition);
    return (record) => of(record) === wanted;
  }
  if ('in' in condition) {
    const wanted = condition.in.map(checked);
    return (record) => wanted.includes(of(record));
  }
  const bounds = BOUNDS.flatMap(([bound, meets]) => {
    const given = condition[bound];
    return given === undefined ? [] : [{ value: checked(given), meets }];
  });
  return (record) => bounds.every(({ value, meets }) => meets(order(of(record), value)));
}

/**
 * A plugin's records, kept in memory with Toppo's rules: checked as each entity declares them,
 * within their limits, seen as their issue is, or their project by an issue of it; on a person,
 * by them, or their teammates when the entity says so, written by them only.
 */
export function createTestRecords(
  manifest: Manifest,
  issues: ReadonlyMap<string, IssueDetails>,
  people: ReadonlyMap<string, Reach>,
  nextId: () => string,
) {
  const kept: Kept[] = [];

  function entityOf(name: string): EntityDeclaration {
    const entity = Object.hasOwn(manifest.entities, name) ? manifest.entities[name] : undefined;
    if (!entity) {
      throw refusal('ENTITY_NOT_FOUND');
    }
    return entity;
  }

  const reaches = (reader: Reader, projectId: string) =>
    [...issues.values()].some(
      (issue) => issue.projectId === projectId && (reader === null || reader.sees(issue.id)),
    );

  /** Whether the reader sees the records on a person: the plugin's people's, or as `entity` says. */
  function personSeenBy(reader: Reader, entity: EntityDeclaration, personId: string): boolean {
    const reach = people.get(personId);
    if (reader === null) {
      return worksSomewhere(reach);
    }
    return entity.visibleTo === 'teammates'
      ? teammates(people.get(reader.id), reach)
      : reader.id === personId && worksSomewhere(reach);
  }

  function seenBy(reader: Reader, record: Kept): boolean {
    if (record.personId !== null) {
      return personSeenBy(reader, entityOf(record.entity), record.personId);
    }
    if (record.issueId !== null) {
      return reader === null || reader.sees(record.issueId);
    }
    return record.projectId !== null && reaches(reader, record.projectId);
  }

  function checked(entity: EntityDeclaration, fields: unknown): Record<string, unknown> {
    const parsed = recordFieldsSchemaOf(entity.fields).safeParse(fields);
    if (!parsed.success || JSON.stringify(parsed.data).length > RECORD_MAX_BYTES) {
      throw refusal('RECORD_INVALID');
    }
    return parsed.data;
  }

  function anchorOf(
    reader: Reader,
    entity: EntityDeclaration,
    given: Partial<Record<keyof Anchor, string | undefined>>,
  ): Anchor {
    const anchor = ANCHORS[entity.attachedTo].given;
    const id = given[anchor];
    const others = Object.values(ANCHORS).filter(({ given: other }) => other !== anchor);
    if (id === undefined || others.some(({ given: other }) => given[other] !== undefined)) {
      throw refusal('RECORD_INVALID');
    }
    switch (entity.attachedTo) {
      case 'issue':
        return issueAnchorOf(reader, id);
      case 'project':
        if (!reaches(reader, id)) {
          throw refusal('NOT_FOUND');
        }
        return { issueId: null, projectId: id, personId: null };
      case 'person':
        return personAnchorOf(reader, id);
    }
  }

  function issueAnchorOf(reader: Reader, issueId: string): Anchor {
    const issue = issues.get(issueId);
    if (!(issue && (reader === null || reader.sees(issue.id)))) {
      throw refusal('NOT_FOUND');
    }
    return { issueId: issue.id, projectId: issue.projectId, personId: null };
  }

  /** Acting for someone, themselves only; as itself, anyone working in a project. */
  function personAnchorOf(reader: Reader, personId: string): Anchor {
    if (reader !== null && reader.id !== personId) {
      throw refusal('FORBIDDEN');
    }
    if (!worksSomewhere(people.get(personId))) {
      throw refusal('PERSON_NOT_FOUND');
    }
    return { issueId: null, projectId: null, personId };
  }

  function create(reader: Reader, args: unknown): RecordData {
    const {
      entity: name,
      issueId,
      projectId,
      personId,
      fields,
    } = HOST_CALLS['entities.create'].args.parse(args);
    const entity = entityOf(name);
    const anchor = anchorOf(reader, entity, { issueId, projectId, personId });
    const data = checked(entity, fields);
    const held = kept.filter(
      (record) =>
        record.entity === name &&
        record.issueId === anchor.issueId &&
        record.projectId === anchor.projectId &&
        record.personId === anchor.personId,
    ).length;
    const { limit: kind } = ANCHORS[entity.attachedTo];
    if (held >= (entity.limits[kind] ?? ENTITY_LIMITS[kind].default)) {
      throw refusal('RECORD_LIMIT_REACHED');
    }
    const now = new Date().toISOString();
    const record: Kept = {
      id: nextId(),
      entity: name,
      ...anchor,
      createdBy: reader?.id ?? TEST_PLUGIN_USER_ID,
      createdAt: now,
      updatedAt: now,
      fields: data,
    };
    kept.push(record);
    return shown(record);
  }

  function seen(reader: Reader, name: string, id: string): Kept | undefined {
    entityOf(name);
    return kept.find(
      (record) => record.entity === name && record.id === id && seenBy(reader, record),
    );
  }

  /** A record the reader sees, and may change: acting for someone, theirs only on a person. */
  function toChange(reader: Reader, name: string, id: string): Kept {
    const record = seen(reader, name, id);
    if (!record || (reader !== null && ![null, reader.id].includes(record.personId))) {
      throw refusal('RECORD_NOT_FOUND');
    }
    return record;
  }

  function update(reader: Reader, args: unknown): RecordData {
    const { entity: name, id, fields } = HOST_CALLS['entities.update'].args.parse(args);
    const record = toChange(reader, name, id);
    record.fields = checked(entityOf(name), { ...record.fields, ...fields });
    record.updatedAt = new Date().toISOString();
    return shown(record);
  }

  function remove(reader: Reader, args: unknown): null {
    const { entity: name, id } = HOST_CALLS['entities.delete'].args.parse(args);
    const record = toChange(reader, name, id);
    kept.splice(kept.indexOf(record), 1);
    return null;
  }

  function matching(
    reader: Reader,
    name: string,
    where: {
      issueId?: string | undefined;
      projectId?: string | undefined;
      personId?: string | undefined;
      createdBy?: string | undefined;
      fields?: Record<string, FieldCondition> | undefined;
    },
  ): Kept[] {
    const entity = entityOf(name);
    const conditions = Object.entries(where.fields ?? {}).map(([field, condition]) =>
      conditionOf(indexedField(entity, field), field, condition),
    );
    return kept.filter(
      (record) =>
        record.entity === name &&
        seenBy(reader, record) &&
        (where.issueId === undefined || record.issueId === where.issueId) &&
        (where.projectId === undefined || record.projectId === where.projectId) &&
        (where.personId === undefined || record.personId === where.personId) &&
        (where.createdBy === undefined || record.createdBy === where.createdBy) &&
        conditions.every((meets) => meets(record)),
    );
  }

  function list(reader: Reader, args: unknown) {
    const { entity, where, orderBy, direction, page, pageSize } =
      HOST_CALLS['entities.list'].args.parse(args);
    const found = matching(reader, entity, where);
    // Kept as written: sorted on a field, those written alike stay as they were written.
    const declared = orderBy === 'createdAt' ? undefined : indexedField(entityOf(entity), orderBy);
    const sorted = declared
      ? [...found].sort((left, right) =>
          order(
            comparableOf(declared, left.fields[orderBy]),
            comparableOf(declared, right.fields[orderBy]),
          ),
        )
      : found;
    const ordered = direction === 'desc' ? [...sorted].reverse() : sorted;
    return {
      items: ordered.slice((page - 1) * pageSize, page * pageSize).map(shown),
      total: found.length,
    };
  }

  /** What records are grouped by: an anchor, or a field the entity indexes. */
  function groupKeyOf(name: string, groupBy: string): (record: Kept) => string | number | null {
    if (isRecordGroup(groupBy)) {
      return GROUP_KEYS[groupBy];
    }
    const declared = indexedField(entityOf(name), groupBy);
    return (record) => comparableOf(declared, record.fields[groupBy]);
  }

  function aggregate(reader: Reader, args: unknown) {
    const {
      entity: name,
      op,
      field,
      where,
      groupBy,
    } = HOST_CALLS['entities.aggregate'].args.parse(args);
    const declared = field === undefined ? undefined : entityOf(name).fields.properties[field];
    if (op === 'sum' && !(declared?.type === 'number' || declared?.type === 'integer')) {
      throw refusal('RECORD_INVALID');
    }
    const measured = (record: Kept) => {
      if (op === 'count') {
        return 1;
      }
      const value = field === undefined ? undefined : record.fields[field];
      return typeof value === 'number' ? value : 0;
    };
    const found = matching(reader, name, where);
    const total = found.reduce((sum, record) => sum + measured(record), 0);
    if (groupBy === undefined) {
      return { total };
    }
    const keyOf = groupKeyOf(name, groupBy);
    const groups = new Map<string | number | null, number>();
    for (const record of found) {
      const key = keyOf(record);
      groups.set(key, (groups.get(key) ?? 0) + measured(record));
    }
    return {
      total,
      groups: [...groups]
        .map(([key, value]) => ({ key, value }))
        .sort((left, right) => right.value - left.value)
        .slice(0, RECORD_GROUPS_MAX),
    };
  }

  return {
    /** Toppo's answer to a call about records, for `reader`. */
    answer(method: string, args: unknown, reader: Reader): unknown {
      switch (method) {
        case 'entities.create':
          return create(reader, args);
        case 'entities.get': {
          const { entity, id } = HOST_CALLS['entities.get'].args.parse(args);
          const record = seen(reader, entity, id);
          return record ? shown(record) : null;
        }
        case 'entities.update':
          return update(reader, args);
        case 'entities.delete':
          return remove(reader, args);
        case 'entities.list':
          return list(reader, args);
        default:
          return aggregate(reader, args);
      }
    },
    /** What the plugin kept of `entity`, oldest first, whoever sees it. */
    of(entity: string): RecordData[] {
      return kept.filter((record) => record.entity === entity).map(shown);
    },
  };
}

function shown({ entity: _entity, ...record }: Kept): RecordData {
  return { ...record, fields: { ...record.fields } };
}
