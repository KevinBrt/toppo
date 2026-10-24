import type { IssueSummary } from '@toppo/shared';
import { describe, expect, it } from 'vitest';
import { groupKeyOf, sectionsOf } from './issue-groups.util.ts';

const NEW = '01a1569b-9900-7000-8000-000000000001';
const DONE = '01a1569b-9900-7000-8000-000000000002';
const NORMAL = '01a1569b-9900-7000-8000-000000000003';
const GRACE = '01a1569b-9900-7000-8000-000000000004';

function issue(key: string, statusId: string, assigneeId: string | null = null): IssueSummary {
  return {
    key,
    title: key,
    status: { id: statusId, name: statusId, color: 'gray', closes: false },
    category: { id: NORMAL, name: 'Bug', color: 'gray' },
    priority: { id: NORMAL, name: 'Normal', level: 2 },
    assignee: assigneeId ? { id: assigneeId, name: 'Grace' } : null,
    reporter: { id: GRACE, name: 'Grace' },
    createdAt: '2026-10-22T09:14:00.000Z',
    labels: [],
    properties: [],
    updatedAt: '2026-10-22T09:14:00.000Z',
  };
}

describe('sectionsOf', () => {
  it('keeps a list not grouped whole', () => {
    const issues = [issue('WEB-2', NEW), issue('WEB-1', DONE)];

    expect(sectionsOf(issues, undefined)).toStrictEqual([{ key: null, issues }]);
  });

  it('cuts a page where each group ends, in the order of the page', () => {
    const [first, second, third] = [issue('WEB-3', NEW), issue('WEB-1', NEW), issue('WEB-2', DONE)];

    expect(sectionsOf([first, second, third], 'status')).toStrictEqual([
      { key: NEW, issues: [first, second] },
      { key: DONE, issues: [third] },
    ]);
  });

  it('groups by priority, and by assignee with no one as null', () => {
    const unassigned = issue('WEB-1', NEW);
    const graces = issue('WEB-2', NEW, GRACE);

    expect(groupKeyOf(unassigned, 'priority')).toBe(NORMAL);
    expect(sectionsOf([graces, unassigned], 'assignee').map(({ key }) => key)).toStrictEqual([
      GRACE,
      null,
    ]);
  });
});
