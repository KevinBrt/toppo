import { describe, expect, it } from 'vitest';
import { issueActivitiesQuerySchema, issueActivitySchema } from './activities.ts';
import {
  assignIssueRequestSchema,
  createIssueRequestSchema,
  issueKeySchema,
  issuesQuerySchema,
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
