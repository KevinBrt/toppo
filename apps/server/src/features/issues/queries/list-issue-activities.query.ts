import { type AttachmentPlace, attachmentActionsOf, commentActionsOf } from '@toppo/core';
import { type Db, schema } from '@toppo/db';
import {
  type AttachmentAction,
  type AttachmentMediaType,
  type CommentAction,
  ISSUE_ACTIVITIES_PAGE_SIZE,
  ISSUE_ACTIVITY_PAYLOADS,
  type IssueActivitiesResponse,
  type IssueActivity,
  type IssueAttachment,
  issueActivitiesQuerySchema,
  issueKeyParamsSchema,
  type UserRef,
} from '@toppo/shared';
import { and, asc, count, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { defineQuery } from '../../../platform/cqrs/cqrs.ts';
import { userRefOf } from '../utils/issue-rows.util.ts';

const { activities, attachments, comments, users } = schema;

/** The activities an issue's history shows: every type listed, so that none is forgotten. */
const SHOWN: Readonly<Record<keyof typeof ISSUE_ACTIVITY_PAYLOADS, boolean>> = {
  'issue.created': true,
  'issue.titleChanged': true,
  'issue.descriptionChanged': true,
  'issue.categoryChanged': true,
  'issue.priorityChanged': true,
  'issue.statusChanged': true,
  'issue.assigneeChanged': true,
  'issue.labelsChanged': true,
  'issue.propertyChanged': true,
  'issue.commented': true,
  'issue.commentEdited': false,
  'issue.commentDeleted': false,
  'issue.attachmentAdded': true,
  'issue.attachmentRemoved': false,
  'issue.deleted': false,
};

const HISTORY_TYPES = Object.entries(SHOWN)
  .filter(([, shown]) => shown)
  .map(([type]) => type);

interface ActivityRow {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
  actor: { id: string; name: string; deletedAt: Date | null };
  comment: { id: string; body: string; editedAt: Date | null; authorId: string } | null;
  attachment: AttachmentRow | null;
}

interface AttachmentRow {
  id: string;
  fileName: string;
  mediaType: AttachmentMediaType;
  size: number;
  uploaderId: string;
}

/** What the caller may do on a file, where it is attached. */
type FileActions = (file: AttachmentRow, place: AttachmentPlace) => AttachmentAction[];

/**
 * One page of an issue's history, newest first, each change checked against its type. A comment
 * shows as it is now, its files with it, with what the caller may do on it; a deleted one is left
 * out. So is a file of the request once removed.
 */
export const listIssueActivities = defineQuery({
  name: 'issue.listActivities',
  access: { project: 'issueKey' },
  input: issueKeyParamsSchema.extend(issueActivitiesQuerySchema.shape),
  async handler({ db, actor, project }, { page }): Promise<IssueActivitiesResponse> {
    const ofIssue = and(
      eq(activities.issueId, project.issue.id),
      inArray(activities.type, HISTORY_TYPES),
      or(ne(activities.type, 'issue.commented'), isNotNull(comments.id)),
      // A file of a comment shows with the comment.
      or(
        ne(activities.type, 'issue.attachmentAdded'),
        and(isNotNull(attachments.id), isNull(attachments.commentId)),
      ),
    );
    // The comment or the file an activity is about, if any: its id is all the activity keeps.
    const about = eq(comments.id, sql`(${activities.payload} ->> 'commentId')::uuid`);
    const aboutFile = eq(attachments.id, sql`(${activities.payload} ->> 'attachmentId')::uuid`);
    const rows = await db
      .select({
        id: activities.id,
        type: activities.type,
        payload: activities.payload,
        createdAt: activities.createdAt,
        actor: { id: users.id, name: users.name, deletedAt: users.deletedAt },
        comment: {
          id: comments.id,
          body: comments.body,
          editedAt: comments.editedAt,
          authorId: comments.authorId,
        },
        attachment: ATTACHMENT_COLUMNS,
      })
      .from(activities)
      .innerJoin(users, eq(users.id, activities.actorId))
      .leftJoin(comments, about)
      .leftJoin(attachments, aboutFile)
      .where(ofIssue)
      // Changes made in one request share its time: they keep the order they were made in.
      .orderBy(desc(activities.createdAt), asc(activities.id))
      .limit(ISSUE_ACTIVITIES_PAGE_SIZE)
      .offset((page - 1) * ISSUE_ACTIVITIES_PAGE_SIZE);
    const [total] = await db
      .select({ count: count() })
      .from(activities)
      .leftJoin(comments, about)
      .leftJoin(attachments, aboutFile)
      .where(ofIssue);
    const namedByComments = await namedByCommentsIn(db, project.issue.id, rows);
    const people = await peopleNamedIn(db, rows, namedByComments);
    const filesOfComments = await filesOfCommentsIn(db, rows);
    // Read-only while archived: nothing to offer.
    const actionsOn = (authorId: string) =>
      project.archived ? [] : commentActionsOf(project.permissions, authorId === actor.id);
    const fileActions: FileActions = (file, place) =>
      project.archived
        ? []
        : attachmentActionsOf(project.permissions, place, file.uploaderId === actor.id);
    const shown = {
      people,
      namedByComments,
      filesOfComments,
      actionsOn,
      fileActions,
      reportedByActor: project.issue.reportedByActor,
      actorId: actor.id,
    };

    return {
      rows: rows.map((row) => toActivity(row, shown)),
      matching: total?.count ?? 0,
      page,
      pageSize: ISSUE_ACTIVITIES_PAGE_SIZE,
    };
  },
});

const ATTACHMENT_COLUMNS = {
  id: attachments.id,
  fileName: attachments.fileName,
  mediaType: attachments.mediaType,
  size: attachments.size,
  uploaderId: attachments.uploaderId,
};

/** The files of the comments of a page, oldest first, in one query: at most 20 per comment. */
async function filesOfCommentsIn(
  db: Db,
  rows: readonly ActivityRow[],
): Promise<Map<string, AttachmentRow[]>> {
  const commentIds = rows.flatMap(({ comment }) => (comment ? [comment.id] : []));
  const files = new Map<string, AttachmentRow[]>();
  if (commentIds.length === 0) {
    return files;
  }
  const found = await db
    .select({ ...ATTACHMENT_COLUMNS, commentId: attachments.commentId })
    .from(attachments)
    .where(inArray(attachments.commentId, commentIds))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  for (const { commentId, ...file } of found) {
    if (commentId) {
      files.set(commentId, [...(files.get(commentId) ?? []), file]);
    }
  }
  return files;
}

/** A file as the history shows it, with what the caller may do on it there. */
function toAttachment(file: AttachmentRow, actions: AttachmentAction[]): IssueAttachment {
  const { id, fileName, mediaType, size } = file;
  return { id, fileName, mediaType, size, actions };
}

/**
 * Whom each comment of a page has named, by comment id, in one query: what its activities told,
 * when it was written and at each edit.
 */
async function namedByCommentsIn(
  db: Db,
  issueId: string,
  rows: readonly ActivityRow[],
): Promise<Map<string, string[]>> {
  const commentIds = rows.flatMap(({ comment }) => (comment ? [comment.id] : []));
  const named = new Map<string, string[]>();
  if (commentIds.length === 0) {
    return named;
  }
  const commentId = sql<string>`${activities.payload} ->> 'commentId'`;
  const found = await db
    .select({
      commentId,
      userId: sql<string>`jsonb_array_elements_text(${activities.payload} -> 'mentioned')`,
    })
    .from(activities)
    .where(
      and(
        eq(activities.issueId, issueId),
        inArray(activities.type, ['issue.commented', 'issue.commentEdited']),
        inArray(commentId, commentIds),
      ),
    )
    .orderBy(asc(activities.id));
  for (const row of found) {
    named.set(row.commentId, [...(named.get(row.commentId) ?? []), row.userId]);
  }
  return named;
}

/**
 * The people assignment changes and comments name, by id, in one query: named as they are now.
 */
async function peopleNamedIn(
  db: Db,
  rows: readonly ActivityRow[],
  namedByComments: ReadonlyMap<string, readonly string[]>,
): Promise<Map<string, UserRef>> {
  const ids = new Set([...namedByComments.values()].flat());
  for (const row of rows) {
    if (row.type === 'issue.assigneeChanged') {
      const { from, to } = ISSUE_ACTIVITY_PAYLOADS['issue.assigneeChanged'].parse(row.payload);
      for (const id of [from, to]) {
        if (id) {
          ids.add(id);
        }
      }
    }
  }
  if (ids.size === 0) {
    return new Map();
  }
  const named = await db
    .select({ id: users.id, name: users.name, deletedAt: users.deletedAt })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(named.map((user) => [user.id, userRefOf(user)]));
}

/** What a page of history needs, besides its rows, to show them. */
interface Shown {
  people: ReadonlyMap<string, UserRef>;
  namedByComments: ReadonlyMap<string, readonly string[]>;
  filesOfComments: ReadonlyMap<string, AttachmentRow[]>;
  actionsOn: (authorId: string) => CommentAction[];
  fileActions: FileActions;
  reportedByActor: boolean;
  actorId: string;
}

/** A stored activity as the history shows it. */
function toActivity(row: ActivityRow, shown: Shown): IssueActivity {
  const { people, filesOfComments, actionsOn, fileActions } = shown;
  const base = { id: row.id, actor: userRefOf(row.actor), createdAt: row.createdAt.toISOString() };
  const { payload } = row;
  const payloads = ISSUE_ACTIVITY_PAYLOADS;
  const person = (id: string | null) => (id ? (people.get(id) ?? { id, name: null }) : null);

  switch (row.type) {
    case 'issue.created':
      // Who it was given to shows as a step of its own.
      return { ...base, type: 'issue.created', payload: {} };
    case 'issue.titleChanged':
      return {
        ...base,
        type: 'issue.titleChanged',
        payload: payloads['issue.titleChanged'].parse(payload),
      };
    case 'issue.descriptionChanged':
      return {
        ...base,
        type: 'issue.descriptionChanged',
        payload: payloads['issue.descriptionChanged'].parse(payload),
      };
    case 'issue.categoryChanged':
      return {
        ...base,
        type: 'issue.categoryChanged',
        payload: payloads['issue.categoryChanged'].parse(payload),
      };
    case 'issue.priorityChanged':
      return {
        ...base,
        type: 'issue.priorityChanged',
        payload: payloads['issue.priorityChanged'].parse(payload),
      };
    case 'issue.statusChanged':
      return {
        ...base,
        type: 'issue.statusChanged',
        payload: payloads['issue.statusChanged'].parse(payload),
      };
    case 'issue.assigneeChanged': {
      const { from, to } = payloads['issue.assigneeChanged'].parse(payload);
      return {
        ...base,
        type: 'issue.assigneeChanged',
        payload: { from: person(from), to: person(to) },
      };
    }
    case 'issue.labelsChanged':
      return {
        ...base,
        type: 'issue.labelsChanged',
        payload: payloads['issue.labelsChanged'].parse(payload),
      };
    case 'issue.propertyChanged':
      return {
        ...base,
        type: 'issue.propertyChanged',
        payload: payloads['issue.propertyChanged'].parse(payload),
      };
    case 'issue.commented': {
      if (!row.comment) {
        throw new Error(`The comment of activity ${row.id} is gone`);
      }
      const { id, body, editedAt, authorId } = row.comment;
      const place = { on: 'comment', writtenByThem: authorId === shown.actorId } as const;
      return {
        ...base,
        type: 'issue.commented',
        payload: {
          comment: {
            id,
            body,
            editedAt: editedAt?.toISOString() ?? null,
            attachments: (filesOfComments.get(id) ?? []).map((file) =>
              toAttachment(file, fileActions(file, place)),
            ),
            mentions: (shown.namedByComments.get(id) ?? []).map(
              (named) => people.get(named) ?? { id: named, name: null },
            ),
            actions: actionsOn(authorId),
          },
        },
      };
    }
    case 'issue.attachmentAdded': {
      if (!row.attachment) {
        throw new Error(`The file of activity ${row.id} is gone`);
      }
      const place = { on: 'request', reportedByThem: shown.reportedByActor } as const;
      return {
        ...base,
        type: 'issue.attachmentAdded',
        payload: { attachment: toAttachment(row.attachment, fileActions(row.attachment, place)) },
      };
    }
    default:
      throw new Error(`An activity of an unknown type: ${row.type}`);
  }
}
