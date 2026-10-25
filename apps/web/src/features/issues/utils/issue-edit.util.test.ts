import type { IssueResponse } from '@toppo/shared';
import { describe, expect, it } from 'vitest';
import { applyEdit } from './issue-edit.util.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';

const ISSUE: IssueResponse = {
  id: ID,
  key: 'WEB-1',
  project: { key: 'WEB', name: 'Website' },
  title: 'Broken link',
  description: '',
  status: { id: ID, name: 'New', color: 'cyan', closes: false },
  category: { id: ID, name: 'Bug', color: 'gray' },
  priority: { id: ID, name: 'Normal', level: 2 },
  assignee: null,
  reporter: { id: ID, name: 'Ada' },
  createdAt: '2026-10-22T09:14:00.000Z',
  labels: [],
  properties: [],
  updatedAt: '2026-10-22T09:14:00.000Z',
  closedAt: null,
  actions: [],
  following: true,
  followerCount: 1,
};

describe('applyEdit', () => {
  it('changes the field edited, and only it', () => {
    expect(applyEdit(ISSUE, { field: 'title', title: 'Dead link' })).toStrictEqual({
      ...ISSUE,
      title: 'Dead link',
    });
    expect(applyEdit(ISSUE, { field: 'description', description: '# Steps' }).description).toBe(
      '# Steps',
    );
    expect(
      applyEdit(ISSUE, { field: 'assignee', assignee: { id: ID, name: 'Grace' } }).assignee,
    ).toStrictEqual({ id: ID, name: 'Grace' });
  });

  it('takes whole values for the fields chosen from a list', () => {
    const status = { id: ID, name: 'Resolved', color: 'green', closes: true } as const;
    const category = { id: ID, name: 'Question', color: 'violet' } as const;
    const priority = { id: ID, name: 'Urgent', level: 4 } as const;

    expect(applyEdit(ISSUE, { field: 'status', status }).status).toStrictEqual(status);
    expect(applyEdit(ISSUE, { field: 'category', category }).category).toStrictEqual(category);
    expect(applyEdit(ISSUE, { field: 'priority', priority }).priority).toStrictEqual(priority);
  });

  it('gives a property its value, or takes it away, keeping the others', () => {
    const due = { id: 'due', name: 'Due', type: 'date', value: '2026-11-02' } as const;
    const estimate = { id: 'estimate', name: 'Estimate', type: 'number', value: 3 } as const;
    const issue = { ...ISSUE, properties: [estimate] };

    expect(
      applyEdit(issue, { field: 'property', propertyId: 'due', value: due }).properties,
    ).toStrictEqual([estimate, due]);
    expect(
      applyEdit(issue, { field: 'property', propertyId: 'estimate', value: null }).properties,
    ).toStrictEqual([]);
  });
});
