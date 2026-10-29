import { z } from 'zod';
import { ENTITY_INDEXES_TOTAL, ENTITY_NAME } from './declarations/entities.ts';
import { httpAnswerSchema, httpRequestSchema } from './declarations/http.ts';
import { issueSnapshotSchema } from './events.ts';

/** The value of one of a plugin's properties: a number, a text, a day, a box ticked (`true`). */
const propertyValueSchema = z.union([z.number(), z.string(), z.boolean()]);

/** An issue with its words, as `ctx.issues.get` answers it. */
export const issueDetailsSchema = issueSnapshotSchema.extend({
  /** Markdown. */
  description: z.string(),
  /** The values of the plugin's own properties it has, by their names in the plugin. */
  properties: z.record(z.string(), propertyValueSchema).default({}),
});

export type IssueDetails = z.infer<typeof issueDetailsSchema>;

/** A record as Toppo keeps it: where it hangs, who wrote it and when, and its fields apart. */
export const recordSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid().nullable(),
  projectId: z.uuid(),
  /** `null` once Toppo no longer knows who: never, today. */
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  fields: z.record(z.string(), z.unknown()),
});

export type RecordData = z.infer<typeof recordSchema>;

/** At most this many groups in a count or a sum by group: the largest first. */
export const RECORD_GROUPS_MAX = 1000;

/** At most this many values a field may be one of, in a condition. */
export const RECORD_IN_MAX = 100;

const entityArg = z.string().regex(ENTITY_NAME);

/** What an indexed field is compared with: Toppo checks it is of the field's kind. */
const indexedValueSchema = z.union([z.string().max(320), z.number()]);

/** What an indexed field must be: a value, one of a list, or within bounds. */
const fieldConditionSchema = z.union([
  indexedValueSchema,
  z.strictObject({ in: z.array(indexedValueSchema).min(1).max(RECORD_IN_MAX) }),
  z
    .strictObject({
      gt: indexedValueSchema.optional(),
      gte: indexedValueSchema.optional(),
      lt: indexedValueSchema.optional(),
      lte: indexedValueSchema.optional(),
    })
    .refine((bounds) => Object.keys(bounds).length > 0, { message: 'A bound at least' }),
]);

export type FieldCondition = z.infer<typeof fieldConditionSchema>;

/**
 * Which records: on an issue, in a project, written by someone, with indexed fields as said; all
 * those it sees otherwise.
 */
export const recordWhereSchema = z
  .strictObject({
    issueId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    createdBy: z.uuid().optional(),
    fields: z
      .record(z.string().regex(ENTITY_NAME), fieldConditionSchema)
      .refine((fields) => Object.keys(fields).length <= ENTITY_INDEXES_TOTAL, {
        message: `At most ${ENTITY_INDEXES_TOTAL} fields, as many as an entity indexes`,
      })
      .optional(),
  })
  .default({});

/** An anchor of records (`createdBy`), or a field the entity indexes. */
const recordKeyArg = z.string().regex(ENTITY_NAME);

const recordFieldsArg = z.record(z.string(), z.unknown());

/** As long as a comment of Toppo's may be. */
const COMMENT_BODY_MAX_LENGTH = 20_000;

/**
 * What a plugin may ask Toppo, through `__host.call(method, args)`: the core permission each
 * takes (which the plugin must list in its `needs`; none to read what is its own), its arguments,
 * and Toppo's answer. Toppo checks the arguments again, and the access of whoever it acts for.
 */
export const HOST_CALLS = {
  'issues.get': {
    needs: 'issue.read',
    args: z.object({ issueId: z.uuid() }),
    /** `null` for an issue the plugin, or whoever it acts for, does not see. */
    result: issueDetailsSchema.nullable(),
  },
  'issues.comment': {
    needs: 'comment.create',
    args: z.object({
      issueId: z.uuid(),
      body: z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH),
      /** A key that makes the comment single: an event handled twice comments once. */
      once: z.string().min(1).max(200).optional(),
    }),
    result: z.object({ commentId: z.uuid() }),
  },
  'issues.setProperty': {
    // One of its own properties, which it alone writes: no core permission, on an issue it sees.
    needs: null,
    args: z.object({
      issueId: z.uuid(),
      /** As the plugin names it: `timeSpent`. */
      property: z.string().regex(ENTITY_NAME),
      /** Checked by Toppo against the property's type; `null`, or `false` for a box, for none. */
      value: propertyValueSchema.nullable(),
    }),
    result: z.null(),
  },
  'projects.settings': {
    needs: null,
    args: z.object({ projectId: z.uuid() }),
    /**
     * As the project saved them, the plugin's defaults applied by the SDK. Refused (`PROJECT_NOT_FOUND`)
     * for a project the plugin, or whoever it acts for, does not reach.
     */
    result: z.record(z.string(), z.unknown()),
  },
  // Its own records: no core permission, but only those it, and whoever it acts for, sees.
  'entities.create': {
    needs: null,
    args: z.object({
      entity: entityArg,
      /** The issue or the project it hangs on, as its entity says. */
      issueId: z.uuid().optional(),
      projectId: z.uuid().optional(),
      fields: recordFieldsArg,
    }),
    result: recordSchema,
  },
  'entities.get': {
    needs: null,
    args: z.object({ entity: entityArg, id: z.uuid() }),
    /** `null` for a record that is not there, or not seen. */
    result: recordSchema.nullable(),
  },
  'entities.update': {
    needs: null,
    /** The fields given replace those it had; the others stay. */
    args: z.object({ entity: entityArg, id: z.uuid(), fields: recordFieldsArg }),
    result: recordSchema,
  },
  'entities.delete': {
    needs: null,
    args: z.object({ entity: entityArg, id: z.uuid() }),
    result: z.null(),
  },
  'entities.list': {
    needs: null,
    args: z.object({
      entity: entityArg,
      where: recordWhereSchema,
      /** When they were written, or a field the entity indexes; the latest first unless said. */
      orderBy: recordKeyArg.default('createdAt'),
      direction: z.enum(['asc', 'desc']).default('desc'),
      page: z.int().min(1).max(10_000).default(1),
      pageSize: z.int().min(1).max(100).default(50),
    }),
    result: z.object({ items: z.array(recordSchema).max(100), total: z.int().nonnegative() }),
  },
  'entities.aggregate': {
    needs: null,
    args: z.object({
      entity: entityArg,
      /** A count of records, or the sum of a number field. */
      op: z.enum(['count', 'sum']),
      field: z.string().regex(ENTITY_NAME).optional(),
      where: recordWhereSchema,
      /** The issue, the project, the author, or a field the entity indexes. */
      groupBy: recordKeyArg.optional(),
    }),
    result: z.object({
      total: z.number(),
      /**
       * By group when asked, the largest first: keyed by an id (`null` for none), or by the
       * field's value, a date as `2026-10-28`.
       */
      groups: z
        .array(z.object({ key: indexedValueSchema.nullable(), value: z.number() }))
        .max(RECORD_GROUPS_MAX)
        .optional(),
    }),
  },
  /**
   * Sends a request outside Toppo, where the plugin declared it may (`http` in its manifest), to
   * a public address unless its approval names the host. Rejected with one of HTTP_FAILURES.
   */
  'http.fetch': {
    needs: null,
    args: httpRequestSchema,
    result: httpAnswerSchema,
  },
} as const;

export type HostCallMethod = keyof typeof HOST_CALLS;

/** The core permissions a plugin may need: those its calls take. */
export const PLUGIN_NEEDS = ['issue.read', 'comment.create'] as const;

export type PluginNeed = (typeof PLUGIN_NEEDS)[number];
