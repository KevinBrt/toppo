import { z } from 'zod';
import { asksAtLeast } from '../version.ts';

/** At most this many entities in a plugin, and fields in an entity. */
export const PLUGIN_ENTITIES_MAX = 10;
export const ENTITY_FIELDS_MAX = 30;

/** What a record's fields may weigh, as JSON. */
export const RECORD_MAX_BYTES = 16 * 1024;

/** The longest text a record's field holds: a text field says how long it may be, up to this. */
export const RECORD_TEXT_MAX_LENGTH = 10_000;

/**
 * How many records of an entity Toppo keeps: by default, and at most when the entity says. Each
 * issue bounds its records; the records of a project that hang on no issue are bounded there, and
 * each person's those that hang on them.
 */
export const ENTITY_LIMITS = {
  perIssue: { default: 1_000, max: 10_000 },
  perProject: { default: 100_000, max: 1_000_000 },
  perPerson: { default: 1_000, max: 10_000 },
} as const;

/** What a plugin's records hang on. */
export const ATTACHMENTS = ['issue', 'project', 'person'] as const;

/**
 * Who sees the records that hang on a person, besides the plugin itself: that person only, or
 * also those who share with them a project the plugin acts in.
 */
export const PERSON_VISIBILITIES = ['person', 'teammates'] as const;

/** The plugin API that brought records on a person: a plugin keeping some asks for it. */
export const PERSON_RECORDS_API = '1.1';

/** `timeEntry`, `minutes`: an entity's name, or a field's. */
export const ENTITY_NAME = /^[a-z][A-Za-z0-9]{0,39}$/;

/** What Toppo adds to every record, which no field may be named. */
export const RECORD_ANCHORS = [
  'id',
  'issueId',
  'projectId',
  'personId',
  'createdBy',
  'createdAt',
  'updatedAt',
] as const;

/**
 * What records are listed, counted and summed by: the issue, the project, the person they hang
 * on, who wrote them.
 */
export const RECORD_GROUPS = ['issueId', 'projectId', 'personId', 'createdBy'] as const;

export type RecordGroup = (typeof RECORD_GROUPS)[number];

/** What an indexed field is kept as, for Toppo to filter, sort and group records on it. */
export const INDEX_KINDS = ['date', 'number', 'text', 'ref'] as const;

export type IndexKind = (typeof INDEX_KINDS)[number];

/** At most this many fields of each kind indexed in an entity: as many as Toppo keeps slots. */
export const ENTITY_INDEXES_MAX = {
  date: 3,
  number: 3,
  text: 3,
  ref: 2,
} as const satisfies Record<IndexKind, number>;

export const ENTITY_INDEXES_TOTAL = Object.values(ENTITY_INDEXES_MAX).reduce(
  (sum, max) => sum + max,
  0,
);

/** The longest text an index takes: past it, no one filters on it. */
export const INDEXED_TEXT_MAX_LENGTH = 200;

/**
 * The formats Toppo checks itself, with its own patterns: it never runs a pattern a plugin wrote,
 * which could hold the server up. The plugin's own schema checks the rest, in its sandbox.
 */
const KNOWN_FORMATS = ['date', 'date-time', 'uuid', 'email'] as const;

const ignoredPattern = z.string().max(2000).optional();

/**
 * One field of an entity, as Zod writes it in JSON Schema: a text (bounded, or of a format Toppo
 * knows), a number, a yes or no, or a choice; never null, never nested.
 */
export const entityFieldSchema = z.union(
  [
    z.strictObject({
      type: z.literal('string'),
      enum: z.array(z.string().max(100)).min(1).max(100),
      default: z.string().max(100).optional(),
    }),
    z.strictObject({
      type: z.literal('string'),
      format: z.enum(KNOWN_FORMATS),
      pattern: ignoredPattern,
      default: z.string().max(320).optional(),
    }),
    z.strictObject({
      type: z.literal('string'),
      minLength: z.int().nonnegative().optional(),
      maxLength: z.int().min(1).max(RECORD_TEXT_MAX_LENGTH),
      pattern: ignoredPattern,
      default: z.string().max(RECORD_TEXT_MAX_LENGTH).optional(),
    }),
    z.strictObject({
      type: z.enum(['number', 'integer']),
      minimum: z.number().optional(),
      maximum: z.number().optional(),
      exclusiveMinimum: z.number().optional(),
      exclusiveMaximum: z.number().optional(),
      multipleOf: z.number().positive().optional(),
      default: z.number().optional(),
    }),
    z.strictObject({ type: z.literal('boolean'), default: z.boolean().optional() }),
  ],
  {
    error: `A field is a text of ${RECORD_TEXT_MAX_LENGTH} characters at most (.max()) or of a known format (a date, an id, an email), a number, a yes or no, or a choice: nothing nullable`,
  },
);

export type EntityField = z.infer<typeof entityFieldSchema>;

const fieldNameSchema = z
  .string()
  .regex(ENTITY_NAME, 'A field is named like spentOn')
  .refine((name) => !(RECORD_ANCHORS as readonly string[]).includes(name), {
    message: `Toppo adds ${RECORD_ANCHORS.join(', ')} to every record: name the field otherwise`,
  });

/** An entity's fields: one object, as `z.toJSONSchema` writes it. */
export const entityFieldsSchema = z.strictObject({
  $schema: z.string().max(200).optional(),
  type: z.literal('object'),
  properties: z
    .record(fieldNameSchema, entityFieldSchema)
    .refine((fields) => Object.keys(fields).length <= ENTITY_FIELDS_MAX, {
      message: `At most ${ENTITY_FIELDS_MAX} fields`,
    }),
  required: z.array(z.string()).max(ENTITY_FIELDS_MAX).optional(),
  additionalProperties: z.literal(false).optional(),
});

export type EntityFields = z.infer<typeof entityFieldsSchema>;

/**
 * An entity as its plugin declares it: what its records hang on (and, on a person, who sees
 * them), their fields, those it filters, sorts and groups them on, their bounds.
 */
export const entitySchema = z.strictObject({
  attachedTo: z.enum(ATTACHMENTS),
  visibleTo: z.enum(PERSON_VISIBILITIES).optional(),
  fields: entityFieldsSchema,
  indexes: z.array(z.string().regex(ENTITY_NAME)).max(ENTITY_INDEXES_TOTAL).default([]),
  limits: z.strictObject({
    perIssue: z.int().min(1).max(ENTITY_LIMITS.perIssue.max).optional(),
    perProject: z.int().min(1).max(ENTITY_LIMITS.perProject.max).optional(),
    perPerson: z.int().min(1).max(ENTITY_LIMITS.perPerson.max).optional(),
  }),
});

export type EntityDeclaration = z.infer<typeof entitySchema>;

export const entitiesSchema = z
  .record(z.string().regex(ENTITY_NAME, 'An entity is named like timeEntry'), entitySchema)
  .refine((entities) => Object.keys(entities).length <= PLUGIN_ENTITIES_MAX, {
    message: `At most ${PLUGIN_ENTITIES_MAX} entities`,
  });

/** The bound each attachment takes: an issue's records are bounded by issue, and so on. */
const LIMIT_OF = {
  issue: 'perIssue',
  project: 'perProject',
  person: 'perPerson',
} as const satisfies Record<EntityDeclaration['attachedTo'], keyof EntityDeclaration['limits']>;

type Problem = (path: (string | number)[], message: string) => void;

/**
 * Refuses entities Toppo could not keep as declared, by what they hang on, and indexes it has no
 * slot for.
 */
export function checkEntities(
  manifest: {
    apiVersion: string;
    needs: readonly string[];
    entities: Readonly<Record<string, EntityDeclaration>>;
  },
  ctx: z.RefinementCtx,
): void {
  for (const [name, entity] of Object.entries(manifest.entities)) {
    checkAttachment(manifest, name, entity, (path, message) =>
      ctx.addIssue({ code: 'custom', path: ['entities', name, ...path], message }),
    );
    checkIndexes(name, entity, ctx);
  }
}

/**
 * Refuses what an entity's attachment rules out: records on issues from a plugin that does not
 * read issues, records on a person from a plugin asking for an API older than theirs, who sees
 * them said of another attachment, a bound of another kind (an issue's records are bounded by
 * issue).
 */
function checkAttachment(
  manifest: { apiVersion: string; needs: readonly string[] },
  name: string,
  entity: EntityDeclaration,
  problem: Problem,
): void {
  if (entity.attachedTo === 'issue' && !manifest.needs.includes('issue.read')) {
    problem(['attachedTo'], `${name} hangs on issues: the plugin needs issue.read`);
  }
  if (entity.attachedTo === 'person' && !asksAtLeast(manifest.apiVersion, PERSON_RECORDS_API)) {
    // An older Toppo then refuses the plugin by its API, rather than by an entity it misreads.
    problem(
      ['attachedTo'],
      `${name} hangs on a person: the plugin asks for API ^${PERSON_RECORDS_API}`,
    );
  }
  if (entity.attachedTo !== 'person' && entity.visibleTo !== undefined) {
    problem(['visibleTo'], `${name} hangs on ${entity.attachedTo}s: they are seen as those are`);
  }
  for (const limit of Object.values(LIMIT_OF)) {
    if (limit !== LIMIT_OF[entity.attachedTo] && entity.limits[limit] !== undefined) {
      problem(
        ['limits', limit],
        `${name} hangs on ${entity.attachedTo}s: it has no ${limit} limit`,
      );
    }
  }
}

const INDEX_KIND_WORDS = {
  date: 'dates',
  number: 'numbers',
  text: 'texts',
  ref: 'ids',
} as const satisfies Record<IndexKind, string>;

/**
 * Each indexed field once, of a kind Toppo has a slot for, and no more of a kind than it has
 * slots of.
 */
function checkIndexes(name: string, entity: EntityDeclaration, ctx: z.RefinementCtx): void {
  const taken: Record<IndexKind, number> = { date: 0, number: 0, text: 0, ref: 0 };
  entity.indexes.forEach((field, at) => {
    const indexed = indexedFieldOf(entity, field, at);
    let problem = indexed.problem;
    if (indexed.kind) {
      taken[indexed.kind] += 1;
      if (taken[indexed.kind] > ENTITY_INDEXES_MAX[indexed.kind]) {
        problem = `${name} indexes ${ENTITY_INDEXES_MAX[indexed.kind]} ${INDEX_KIND_WORDS[indexed.kind]} at most`;
      }
    }
    if (problem) {
      ctx.addIssue({ code: 'custom', path: ['entities', name, 'indexes', at], message: problem });
    }
  });
}

/**
 * The kind of slot an indexed field takes, or why it takes none. A field sorted and grouped on is
 * one no record lacks: required, or given a default.
 */
function indexedFieldOf(
  entity: EntityDeclaration,
  field: string,
  at: number,
): { kind: IndexKind; problem?: undefined } | { kind?: undefined; problem: string } {
  if (entity.indexes.indexOf(field) !== at) {
    return { problem: `${field} is indexed twice` };
  }
  const declared = Object.hasOwn(entity.fields.properties, field)
    ? entity.fields.properties[field]
    : undefined;
  if (!declared) {
    return { problem: `There is no field ${field} to index` };
  }
  const kind = indexKindOf(declared);
  if (!kind) {
    return {
      problem: `${field} is not indexed: only a number, a date, an id, a choice or a text of ${INDEXED_TEXT_MAX_LENGTH} characters at most is`,
    };
  }
  if (declared.default === undefined && !entity.fields.required?.includes(field)) {
    return { problem: `${field} is indexed: make it required, or give it a default` };
  }
  return { kind };
}

/**
 * The slot an indexed field takes: a date (or a moment), a number, a text (a choice, an email, a
 * short text), an id. `undefined` for a field none takes: a yes or no, a long text.
 */
export function indexKindOf(field: EntityField): IndexKind | undefined {
  if (field.type === 'boolean') {
    return undefined;
  }
  if (field.type !== 'string') {
    return 'number';
  }
  if ('format' in field) {
    const kinds = { date: 'date', 'date-time': 'date', uuid: 'ref', email: 'text' } as const;
    return kinds[field.format];
  }
  return 'enum' in field || field.maxLength <= INDEXED_TEXT_MAX_LENGTH ? 'text' : undefined;
}

/**
 * What an indexed field is compared with, in a condition: a value of its kind (a date, a moment
 * with its offset, a number, a text, an id). `undefined` for a field no index takes.
 */
export function comparedValueSchemaOf(field: EntityField): z.ZodType<string | number> | undefined {
  switch (indexKindOf(field)) {
    case 'number':
      return z.number();
    case 'date':
      return 'format' in field && field.format === 'date'
        ? z.iso.date()
        : z.iso.datetime({ offset: true });
    case 'text':
      return z.string().max(320);
    case 'ref':
      return z.uuid();
    case undefined:
      return undefined;
  }
}

type NumberField = Extract<EntityField, { type: 'number' | 'integer' }>;
type TextField = Extract<EntityField, { type: 'string' }>;

function numberValidatorOf(field: NumberField): z.ZodNumber {
  const bounds: [number | undefined, (number: z.ZodNumber, value: number) => z.ZodNumber][] = [
    [field.minimum, (number, value) => number.min(value)],
    [field.maximum, (number, value) => number.max(value)],
    [field.exclusiveMinimum, (number, value) => number.gt(value)],
    [field.exclusiveMaximum, (number, value) => number.lt(value)],
    [field.multipleOf, (number, value) => number.multipleOf(value)],
  ];
  return bounds.reduce(
    (number, [value, bound]) => (value === undefined ? number : bound(number, value)),
    field.type === 'integer' ? z.int() : z.number(),
  );
}

function textValidatorOf(field: TextField): z.ZodType {
  if ('enum' in field) {
    const [first = '', ...others] = field.enum;
    return z.enum([first, ...others]);
  }
  if (!('format' in field)) {
    return z
      .string()
      .min(field.minLength ?? 0)
      .max(field.maxLength);
  }
  switch (field.format) {
    case 'date':
      return z.iso.date();
    case 'date-time':
      return z.iso.datetime({ offset: true });
    case 'uuid':
      return z.uuid();
    case 'email':
      return z.email().max(320);
  }
}

function fieldValidatorOf(field: EntityField): z.ZodType {
  if (field.type === 'boolean') {
    return z.boolean();
  }
  return field.type === 'string' ? textValidatorOf(field) : numberValidatorOf(field);
}

/**
 * Toppo's own check of a record's fields, built from what the plugin declared, never from its
 * code: types, lengths, bounds, choices and the formats Toppo knows. Defaults applied; a field
 * Toppo does not know refused.
 */
export function recordFieldsSchemaOf(fields: EntityFields): z.ZodObject {
  const required = new Set(fields.required ?? []);
  return z.strictObject(
    Object.fromEntries(
      Object.entries(fields.properties).map(([name, field]) => {
        const validator = fieldValidatorOf(field);
        if (field.default !== undefined) {
          return [name, validator.default(field.default)];
        }
        return [name, required.has(name) ? validator : validator.optional()];
      }),
    ),
  );
}
