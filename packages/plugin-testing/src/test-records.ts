import {
  ENTITY_LIMITS,
  type EntityDeclaration,
  HOST_CALLS,
  type IssueDetails,
  type Manifest,
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

type Kept = RecordData & { entity: string };

const refusal = (code: string) => new Error(code);

const GROUP_KEYS = {
  issueId: (record: Kept) => record.issueId,
  projectId: (record: Kept) => record.projectId,
  createdBy: (record: Kept) => record.createdBy,
} as const satisfies Record<RecordGroup, (record: Kept) => string | null>;

/**
 * A plugin's records, kept in memory with Toppo's rules: checked as each entity declares them,
 * within their limits, seen as their issue is, or their project by an issue of it.
 */
export function createTestRecords(
  manifest: Manifest,
  issues: ReadonlyMap<string, IssueDetails>,
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

  const seenBy = (reader: Reader, record: Kept) =>
    record.issueId === null
      ? reaches(reader, record.projectId)
      : reader === null || reader.sees(record.issueId);

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
    given: { issueId?: string | undefined; projectId?: string | undefined },
  ): { issueId: string | null; projectId: string } {
    const { issueId, projectId } = given;
    if (entity.attachedTo === 'issue') {
      if (issueId === undefined || projectId !== undefined) {
        throw refusal('RECORD_INVALID');
      }
      return issueAnchorOf(reader, issueId);
    }
    if (projectId === undefined || issueId !== undefined) {
      throw refusal('RECORD_INVALID');
    }
    if (!reaches(reader, projectId)) {
      throw refusal('NOT_FOUND');
    }
    return { issueId: null, projectId };
  }

  function issueAnchorOf(reader: Reader, issueId: string) {
    const issue = issues.get(issueId);
    if (!(issue && (reader === null || reader.sees(issue.id)))) {
      throw refusal('NOT_FOUND');
    }
    return { issueId: issue.id, projectId: issue.projectId };
  }

  function create(reader: Reader, args: unknown): RecordData {
    const {
      entity: name,
      issueId,
      projectId,
      fields,
    } = HOST_CALLS['entities.create'].args.parse(args);
    const entity = entityOf(name);
    const anchor = anchorOf(reader, entity, { issueId, projectId });
    const data = checked(entity, fields);
    const held = kept.filter(
      (record) =>
        record.entity === name &&
        record.issueId === anchor.issueId &&
        record.projectId === anchor.projectId,
    ).length;
    const limit =
      anchor.issueId === null
        ? (entity.limits.perProject ?? ENTITY_LIMITS.perProject.default)
        : (entity.limits.perIssue ?? ENTITY_LIMITS.perIssue.default);
    if (held >= limit) {
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

  function update(reader: Reader, args: unknown): RecordData {
    const { entity: name, id, fields } = HOST_CALLS['entities.update'].args.parse(args);
    const record = seen(reader, name, id);
    if (!record) {
      throw refusal('RECORD_NOT_FOUND');
    }
    record.fields = checked(entityOf(name), { ...record.fields, ...fields });
    record.updatedAt = new Date().toISOString();
    return shown(record);
  }

  function remove(reader: Reader, args: unknown): null {
    const { entity: name, id } = HOST_CALLS['entities.delete'].args.parse(args);
    const record = seen(reader, name, id);
    if (!record) {
      throw refusal('RECORD_NOT_FOUND');
    }
    kept.splice(kept.indexOf(record), 1);
    return null;
  }

  function matching(
    reader: Reader,
    name: string,
    where: {
      issueId?: string | undefined;
      projectId?: string | undefined;
      createdBy?: string | undefined;
    },
  ): Kept[] {
    entityOf(name);
    return kept.filter(
      (record) =>
        record.entity === name &&
        seenBy(reader, record) &&
        (where.issueId === undefined || record.issueId === where.issueId) &&
        (where.projectId === undefined || record.projectId === where.projectId) &&
        (where.createdBy === undefined || record.createdBy === where.createdBy),
    );
  }

  function list(reader: Reader, args: unknown) {
    const { entity, where, order, page, pageSize } = HOST_CALLS['entities.list'].args.parse(args);
    const found = matching(reader, entity, where);
    const ordered = order === 'newest' ? [...found].reverse() : found;
    return {
      items: ordered.slice((page - 1) * pageSize, page * pageSize).map(shown),
      total: found.length,
    };
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
    const groups = new Map<string | null, number>();
    for (const record of found) {
      const key = GROUP_KEYS[groupBy](record);
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
