import { z } from 'zod';
import { issueAttachmentSchema } from './attachments.ts';
import { issueCommentSchema } from './comments.ts';
import { PRIORITY_LEVELS } from './fields.ts';
import { userRefSchema } from './issues.ts';

/** A status or a category as it was named when the change happened. */
const namedSchema = z.object({ id: z.uuid(), name: z.string() });

const prioritySchema = namedSchema.extend({
  level: z.union(PRIORITY_LEVELS.map((level) => z.literal(level))),
});

/**
 * What each kind of activity stores, by type: the record history, notifications, webhooks and
 * plugins read. Names of statuses, categories and priorities are kept as they were; people are
 * kept by id only, so that erasing an account erases its name from history too.
 */
export const ISSUE_ACTIVITY_PAYLOADS = {
  // Who it was given to when created, if anyone: told so, as by an assignment.
  'issue.created': z.object({ assigneeId: z.uuid().nullable().default(null) }),
  'issue.titleChanged': z.object({ from: z.string(), to: z.string() }),
  'issue.descriptionChanged': z.object({ from: z.string(), to: z.string() }),
  'issue.categoryChanged': z.object({ from: namedSchema, to: namedSchema }),
  'issue.priorityChanged': z.object({ from: prioritySchema, to: prioritySchema }),
  'issue.statusChanged': z.object({ from: namedSchema, to: namedSchema }),
  'issue.assigneeChanged': z.object({ from: z.uuid().nullable(), to: z.uuid().nullable() }),
  // Labels as they were named, so that a label deleted since still reads.
  'issue.labelsChanged': z.object({ added: z.array(namedSchema), removed: z.array(namedSchema) }),
  // A comment is kept by id only: deleted, its words leave no trace. The people it names
  // (`@`), newly when it is edited, by id.
  'issue.commented': z.object({ commentId: z.uuid(), mentioned: z.array(z.uuid()).default([]) }),
  'issue.commentEdited': z.object({
    commentId: z.uuid(),
    mentioned: z.array(z.uuid()).default([]),
  }),
  'issue.commentDeleted': z.object({ commentId: z.uuid() }),
  // So is a file: removed, its name leaves no trace. One of a comment shows with the comment.
  'issue.attachmentAdded': z.object({ attachmentId: z.uuid() }),
  'issue.attachmentRemoved': z.object({ attachmentId: z.uuid() }),
  /** Recorded without an issue, which is gone: its key says which it was. */
  'issue.deleted': z.object({ key: z.string() }),
} as const;

export type IssueActivityType = keyof typeof ISSUE_ACTIVITY_PAYLOADS;

export type IssueActivityPayload<T extends IssueActivityType> = z.infer<
  (typeof ISSUE_ACTIVITY_PAYLOADS)[T]
>;

/**
 * What an issue's history shows: not its deletion, recorded once it is gone, nor what happens to
 * a comment or a file after it is added, which it shows itself (edited) or no longer does.
 */
export type HistoryType = Exclude<
  IssueActivityType,
  'issue.deleted' | 'issue.commentEdited' | 'issue.commentDeleted' | 'issue.attachmentRemoved'
>;

/** One change in an issue's history, as `GET /api/v1/issues/:issueKey/activities` shows it. */
const entry = <T extends HistoryType, P extends z.ZodType>(type: T, payload: P) =>
  z.object({
    id: z.uuid(),
    type: z.literal(type),
    actor: userRefSchema,
    /** UTC ISO 8601. */
    createdAt: z.iso.datetime(),
    payload,
  });

export const issueActivitySchema = z.discriminatedUnion('type', [
  // The history shows who an issue is given to by its own step: nothing more here.
  entry('issue.created', z.object({})),
  entry('issue.titleChanged', ISSUE_ACTIVITY_PAYLOADS['issue.titleChanged']),
  entry('issue.descriptionChanged', ISSUE_ACTIVITY_PAYLOADS['issue.descriptionChanged']),
  entry('issue.categoryChanged', ISSUE_ACTIVITY_PAYLOADS['issue.categoryChanged']),
  entry('issue.priorityChanged', ISSUE_ACTIVITY_PAYLOADS['issue.priorityChanged']),
  entry('issue.statusChanged', ISSUE_ACTIVITY_PAYLOADS['issue.statusChanged']),
  // People are named when read: a deleted account shows as such.
  entry(
    'issue.assigneeChanged',
    z.object({ from: userRefSchema.nullable(), to: userRefSchema.nullable() }),
  ),
  entry('issue.labelsChanged', ISSUE_ACTIVITY_PAYLOADS['issue.labelsChanged']),
  // The comment as it is now; a deleted one leaves the history.
  entry('issue.commented', z.object({ comment: issueCommentSchema })),
  // A file of the request, while it is there.
  entry('issue.attachmentAdded', z.object({ attachment: issueAttachmentSchema })),
]);

export type IssueActivity = z.infer<typeof issueActivitySchema>;

export const issueActivitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

export const issueActivitiesResponseSchema = z.object({
  /** One page, newest first. */
  rows: z.array(issueActivitySchema),
  matching: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});

export type IssueActivitiesResponse = z.infer<typeof issueActivitiesResponseSchema>;
