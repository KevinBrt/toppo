import { z } from 'zod';

/**
 * The events a plugin may handle: Toppo's activity types, each with the shape this SDK promises.
 * Written by hand, not taken from Toppo's own schemas: they are a public contract, which changes
 * only by adding to it within a major version.
 */

const id = z.uuid();
const instant = z.iso.datetime();
/** A status, a category, a label or a property, as it was named when the change happened. */
const named = z.object({ id, name: z.string() });
const priority = named.extend({
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

/** An issue as a plugin sees it: what it is and where it stands, not its words. */
export const issueSnapshotSchema = z.object({
  id,
  /** `WEB-42`. */
  key: z.string(),
  projectId: id,
  projectKey: z.string(),
  title: z.string(),
  status: named.extend({ closes: z.boolean() }),
  category: named,
  priority,
  assigneeId: id.nullable(),
  reporterId: id,
  /** When it was closed, while its status closes it. */
  closedAt: instant.nullable(),
  createdAt: instant,
  updatedAt: instant,
});

export type IssueSnapshot = z.infer<typeof issueSnapshotSchema>;

/** What is left of an issue once deleted. */
export const deletedIssueSchema = z.object({ id, key: z.string(), projectId: id });

export type DeletedIssue = z.infer<typeof deletedIssueSchema>;

const comment = z.object({
  id,
  authorId: id,
  /** Markdown. */
  body: z.string(),
  /** The people it names with `@`. */
  mentioned: z.array(id),
});

const attachment = z.object({
  id,
  fileName: z.string(),
  mediaType: z.string(),
  /** In bytes. */
  size: z.number().int().nonnegative(),
});

function propertyChange<T extends string, V extends z.ZodType>(type: T, value: V) {
  return z.object({
    type: z.literal(type),
    property: named,
    from: value.nullable(),
    to: value.nullable(),
  });
}

/** What changed, by event. */
export const EVENT_CHANGES = {
  'issue.created': z.object({}),
  'issue.deleted': z.object({}),
  'issue.titleChanged': z.object({ from: z.string(), to: z.string() }),
  'issue.descriptionChanged': z.object({ from: z.string(), to: z.string() }),
  'issue.statusChanged': z.object({ from: named, to: named }),
  'issue.categoryChanged': z.object({ from: named, to: named }),
  'issue.priorityChanged': z.object({ from: priority, to: priority }),
  'issue.assigneeChanged': z.object({ from: id.nullable(), to: id.nullable() }),
  'issue.labelsChanged': z.object({ added: z.array(named), removed: z.array(named) }),
  'issue.propertyChanged': z.discriminatedUnion('type', [
    propertyChange('list', named),
    propertyChange('multiSelect', z.array(named)),
    propertyChange('text', z.string()),
    propertyChange('number', z.number()),
    propertyChange('date', z.iso.date()),
    propertyChange('user', id),
    propertyChange('checkbox', z.literal(true)),
  ]),
  /** The issue it was marked as a duplicate of, and no longer. */
  'issue.duplicateChanged': z.object({ from: id.nullable(), to: id.nullable() }),
  'issue.commented': z.object({ comment }),
  'issue.commentEdited': z.object({ comment }),
  'issue.commentDeleted': z.object({ commentId: id }),
  'issue.attachmentAdded': z.object({ attachment }),
  'issue.attachmentRemoved': z.object({ attachmentId: id }),
} as const;

export type EventType = keyof typeof EVENT_CHANGES;

export const EVENT_TYPES = Object.keys(EVENT_CHANGES) as readonly EventType[];

/** The change itself: which, when, and who made it (a person, or a plugin's own user). */
const occurrence = z.object({
  id,
  type: z.enum(EVENT_TYPES),
  occurredAt: instant,
  actorId: id,
});

/** What a handler receives: the event, the issue as it stands now, and what changed. */
export type EventPayload<T extends EventType> = {
  event: z.infer<typeof occurrence> & { type: T };
  issue: T extends 'issue.deleted' ? DeletedIssue : IssueSnapshot;
  change: z.infer<(typeof EVENT_CHANGES)[T]>;
};

/** Checks what Toppo sends a handler, for the event it says it is. */
export function eventPayloadSchema(type: EventType) {
  return z.object({
    event: occurrence.extend({ type: z.literal(type) }),
    issue: type === 'issue.deleted' ? deletedIssueSchema : issueSnapshotSchema,
    change: EVENT_CHANGES[type],
  });
}
