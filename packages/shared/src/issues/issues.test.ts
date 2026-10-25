import { describe, expect, it } from 'vitest';
import { issueActivitiesQuerySchema, issueActivitySchema } from './activities.ts';
import {
  assignIssueRequestSchema,
  BULK_ISSUES_MAX,
  bulkFieldsRequestSchema,
  bulkLabelsRequestSchema,
  bulkStatusRequestSchema,
  createIssueRequestSchema,
  issueKeySchema,
  issuesQuerySchema,
  markDuplicateRequestSchema,
  projectIssuesQuerySchema,
  updateIssueRequestSchema,
} from './issues.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';
const OTHER = '01a1569b-9900-7000-8000-000000000002';

describe('projectIssuesQuerySchema', () => {
  it('reads lists joined by commas, the caller as me and no one as none', () => {
    expect(
      projectIssuesQuerySchema.parse({
        status: `${ID},${OTHER}`,
        assignee: 'me,none',
        reporter: 'me',
        state: 'open',
        sort: 'priority',
        group: 'status',
      }),
    ).toStrictEqual({
      page: 1,
      status: [ID, OTHER],
      assignee: ['me', 'none'],
      reporter: ['me'],
      state: 'open',
      sort: 'priority',
      group: 'status',
    });
  });

  it('reads lists already split, so that a parsed query parses again the same', () => {
    const query = projectIssuesQuerySchema.parse({ category: `${ID},${OTHER}`, assignee: 'none' });

    expect(projectIssuesQuerySchema.parse(query)).toStrictEqual(query);
  });

  it('lists the newest first by key, ungrouped, by default', () => {
    expect(projectIssuesQuerySchema.parse({})).toStrictEqual({ page: 1, sort: 'key' });
  });

  it.each([
    { status: 'not-an-id' },
    { reporter: 'none' },
    { sort: 'name' },
    { order: 'up' },
    { group: 'category' },
    { state: 'archived' },
    { priority: Array.from({ length: 51 }, () => ID).join(',') },
  ])('refuses %j', (query) => {
    expect(projectIssuesQuerySchema.safeParse(query).success).toBe(false);
  });
});

describe('issueKeySchema', () => {
  it.each(['WEB-1', 'API2-42', 'A1-999999999'])('accepts %s', (key) => {
    expect(issueKeySchema.safeParse(key).success).toBe(true);
  });

  it.each(['web-1', 'WEB-0', 'WEB-01', 'WEB', 'WEB-1234567890', 'W-1'])('refuses %s', (key) => {
    expect(issueKeySchema.safeParse(key).success).toBe(false);
  });
});

describe('issue requests', () => {
  it('create an issue from a title alone, the rest by default', () => {
    expect(createIssueRequestSchema.parse({ title: '  Broken link ' })).toStrictEqual({
      title: 'Broken link',
      description: '',
      properties: {},
    });
    expect(createIssueRequestSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  it('change only the fields given, at least one', () => {
    expect(updateIssueRequestSchema.parse({ description: '  indented' })).toStrictEqual({
      description: '  indented',
    });
    expect(updateIssueRequestSchema.safeParse({}).success).toBe(false);
  });

  it('assign someone, or nobody', () => {
    expect(assignIssueRequestSchema.parse({ assigneeId: null })).toStrictEqual({
      assigneeId: null,
    });
    expect(assignIssueRequestSchema.safeParse({}).success).toBe(false);
  });

  it('page from the first page', () => {
    expect(issuesQuerySchema.parse({})).toStrictEqual({ page: 1 });
    expect(issueActivitiesQuerySchema.parse({ page: '2' })).toStrictEqual({ page: 2 });
  });
});

describe('duplicates', () => {
  it('name their original by key, and the status they close in', () => {
    expect(
      markDuplicateRequestSchema.safeParse({ originalKey: 'API-7', statusId: ID }).success,
    ).toBe(true);
    expect(
      markDuplicateRequestSchema.safeParse({ originalKey: 'api 7', statusId: ID }).success,
    ).toBe(false);
    expect(markDuplicateRequestSchema.safeParse({ originalKey: 'API-7' }).success).toBe(false);
  });
});

describe('actions on several issues', () => {
  it('take from one issue to the most allowed, each once', () => {
    const keys = (count: number) => Array.from({ length: count }, (_, index) => `WEB-${index + 1}`);
    const status = (issueKeys: string[]) =>
      bulkStatusRequestSchema.safeParse({ issueKeys, statusId: ID }).success;

    expect(status(keys(1))).toBe(true);
    expect(status(keys(BULK_ISSUES_MAX))).toBe(true);
    expect(status([])).toBe(false);
    expect(status(keys(BULK_ISSUES_MAX + 1))).toBe(false);
    expect(status(['WEB-1', 'WEB-1'])).toBe(false);
    expect(status(['web-1'])).toBe(false);
  });

  it('change at least one field, and labels each once', () => {
    const issueKeys = ['WEB-1'];

    expect(bulkFieldsRequestSchema.safeParse({ issueKeys, priorityId: ID }).success).toBe(true);
    expect(bulkFieldsRequestSchema.safeParse({ issueKeys }).success).toBe(false);
    expect(
      bulkLabelsRequestSchema.safeParse({ issueKeys, add: [ID], remove: [OTHER] }).success,
    ).toBe(true);
    expect(bulkLabelsRequestSchema.safeParse({ issueKeys, add: [], remove: [] }).success).toBe(
      false,
    );
    expect(bulkLabelsRequestSchema.safeParse({ issueKeys, add: [ID], remove: [ID] }).success).toBe(
      false,
    );
  });
});

describe('issueActivitySchema', () => {
  const base = { id: ID, actor: { id: ID, name: 'Ada' }, createdAt: '2026-10-22T10:00:00.000Z' };

  it('reads each change with the payload of its type', () => {
    const moved = {
      ...base,
      type: 'issue.statusChanged',
      payload: { from: { id: ID, name: 'New' }, to: { id: ID, name: 'Resolved' } },
    };
    const assigned = {
      ...base,
      type: 'issue.assigneeChanged',
      payload: { from: null, to: { id: ID, name: null } },
    };

    expect(issueActivitySchema.parse(moved)).toStrictEqual(moved);
    expect(issueActivitySchema.parse(assigned)).toStrictEqual(assigned);
  });

  it('refuses a payload of another type, and the deletion, which has no issue left', () => {
    expect(
      issueActivitySchema.safeParse({
        ...base,
        type: 'issue.titleChanged',
        payload: { from: { id: ID, name: 'New' }, to: { id: ID, name: 'Done' } },
      }).success,
    ).toBe(false);
    expect(
      issueActivitySchema.safeParse({ ...base, type: 'issue.deleted', payload: { key: 'WEB-1' } })
        .success,
    ).toBe(false);
  });
});
