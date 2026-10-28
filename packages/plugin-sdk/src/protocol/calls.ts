import { z } from 'zod';
import { ENTITY_NAME, RECORD_GROUPS } from './entities.ts';
import { issueSnapshotSchema } from './events.ts';

/** An issue with its words, as `ctx.issues.get` answers it. */
export const issueDetailsSchema = issueSnapshotSchema.extend({
  /** Markdown. */
  description: z.string(),
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

const entityArg = z.string().regex(ENTITY_NAME);

/** Which records: on an issue, in a project, written by someone; all those it sees otherwise. */
const recordWhereSchema = z
  .strictObject({
    issueId: z.uuid().optional(),
    projectId: z.uuid().optional(),
    createdBy: z.uuid().optional(),
  })
  .default({});

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
  'projects.settings': {
    needs: null,
    args: z.object({ projectId: z.uuid() }),
    /**
     * As the project saved them, the plugin's defaults applied by the SDK. Refused (`NOT_FOUND`)
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
      order: z.enum(['newest', 'oldest']).default('newest'),
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
      groupBy: z.enum(RECORD_GROUPS).optional(),
    }),
    result: z.object({
      total: z.number(),
      /** By group when asked, the largest first. */
      groups: z
        .array(z.object({ key: z.uuid().nullable(), value: z.number() }))
        .max(RECORD_GROUPS_MAX)
        .optional(),
    }),
  },
} as const;

export type HostCallMethod = keyof typeof HOST_CALLS;

/** The core permissions a plugin may need: those its calls take. */
export const PLUGIN_NEEDS = ['issue.read', 'comment.create'] as const;

export type PluginNeed = (typeof PLUGIN_NEEDS)[number];
