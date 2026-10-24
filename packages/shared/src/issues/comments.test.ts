import { describe, expect, it } from 'vitest';
import { issueActivitySchema } from './activities.ts';
import {
  COMMENT_BODY_MAX_LENGTH,
  commentParamsSchema,
  commentRequestSchema,
  MENTIONS_MAX,
} from './comments.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';

describe('commentRequestSchema', () => {
  it('keeps the line breaks of a comment, without the blanks around it', () => {
    expect(commentRequestSchema.parse({ body: '  First line.\nSecond line.\n\n' })).toStrictEqual({
      body: 'First line.\nSecond line.',
      mentions: [],
    });
  });

  it('names at most 20 people, by id', () => {
    const named = (count: number) =>
      commentRequestSchema.safeParse({ body: 'Hello', mentions: Array(count).fill(ID) }).success;

    expect(named(MENTIONS_MAX)).toBe(true);
    expect(named(MENTIONS_MAX + 1)).toBe(false);
    expect(commentRequestSchema.safeParse({ body: 'Hello', mentions: ['ada'] }).success).toBe(
      false,
    );
  });

  it.each(['', '  \n  ', 'a'.repeat(COMMENT_BODY_MAX_LENGTH + 1)])(
    'refuses a blank or overlong comment',
    (body) => {
      expect(commentRequestSchema.safeParse({ body }).success).toBe(false);
    },
  );

  it('names a comment of an issue by its key and id', () => {
    expect(commentParamsSchema.safeParse({ issueKey: 'WEB-1', commentId: ID }).success).toBe(true);
    expect(commentParamsSchema.safeParse({ issueKey: 'WEB-1', commentId: 'x' }).success).toBe(
      false,
    );
  });
});

describe('a comment in the history', () => {
  const comment = {
    id: ID,
    type: 'issue.commented',
    actor: { id: ID, name: 'Ada' },
    createdAt: '2026-10-22T10:00:00.000Z',
    payload: {
      comment: {
        id: ID,
        body: '**Fixed**, @Grace Hopper',
        editedAt: null,
        attachments: [],
        mentions: [{ id: ID, name: 'Grace Hopper' }],
        actions: ['edit'],
      },
    },
  };

  it('shows the comment as it is now, whom it names and what the reader may do on it', () => {
    expect(issueActivitySchema.parse(comment)).toStrictEqual(comment);
  });

  it('never shows its edits or its deletion as steps of their own', () => {
    for (const type of ['issue.commentEdited', 'issue.commentDeleted']) {
      expect(
        issueActivitySchema.safeParse({ ...comment, type, payload: { commentId: ID } }).success,
      ).toBe(false);
    }
  });
});
