import { z } from 'zod';
import { roleBadgeSchema } from '../members/roles.ts';
import { ATTACHMENTS_MAX, issueAttachmentSchema } from './attachments.ts';
import { issueKeyParamsSchema, userRefSchema } from './issues.ts';

/** Mirrors the `comments_body_length` check of the database. */
export const COMMENT_BODY_MAX_LENGTH = 20_000;

/** A comment's words: plain text, its line breaks kept, trimmed, never blank. */
export const commentBodySchema = z.string().trim().min(1).max(COMMENT_BODY_MAX_LENGTH);

/** People a comment may name at once (`@`). */
export const MENTIONS_MAX = 20;

/**
 * Body of `POST /api/v1/issues/:issueKey/comments` and `PATCH …/comments/:commentId`: the words,
 * and the people they name (`@Grace Hopper`), by id, each told once.
 */
export const commentRequestSchema = z.object({
  body: commentBodySchema,
  mentions: z.array(z.uuid()).max(MENTIONS_MAX).default([]),
});

export type CommentRequest = z.input<typeof commentRequestSchema>;

/** Answer of `POST /api/v1/issues/:issueKey/comments`: the new comment's id. */
export const addCommentResponseSchema = z.object({ id: z.uuid() });

/** The path of one comment: `/api/v1/issues/WEB-42/comments/:commentId`. */
export const commentParamsSchema = issueKeyParamsSchema.extend({ commentId: z.uuid() });

/**
 * Body of `GET /api/v1/issues/:issueKey/mentionable`: people a comment may name, by name, with
 * the role they work with in the project, to tell them apart.
 */
export const mentionableResponseSchema = z.object({
  people: z.array(z.object({ id: z.uuid(), name: z.string(), role: roleBadgeSchema })),
});

export type MentionableResponse = z.infer<typeof mentionableResponseSchema>;

/** What someone may do on a comment: its author edits it; its author or a moderator deletes it. */
export const COMMENT_ACTIONS = ['edit', 'delete'] as const;

export type CommentAction = (typeof COMMENT_ACTIONS)[number];

/** A comment as the history shows it: as it is now, its files with it, with what the reader may do on it. */
export const issueCommentSchema = z.object({
  id: z.uuid(),
  /** Plain text, as written. */
  body: z.string(),
  /** UTC ISO 8601 date its author last changed it, or `null`. */
  editedAt: z.iso.datetime().nullable(),
  /** Oldest first. */
  attachments: z.array(issueAttachmentSchema).max(ATTACHMENTS_MAX),
  /** The people it has named (`@`), edits included, as they are named now. */
  mentions: z.array(userRefSchema),
  actions: z.array(z.enum(COMMENT_ACTIONS)),
});

export type IssueComment = z.infer<typeof issueCommentSchema>;
