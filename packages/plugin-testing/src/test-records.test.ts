import { type IssueDetails, manifestSchema } from '@toppo-tracker/plugin-sdk/protocol';
import { describe, expect, it } from 'vitest';
import { createTestRecords, type Reader, TEST_PLUGIN_USER_ID } from './test-records.ts';

const WEB = '00000000-0000-4000-8000-000000000100';
const OPS = '00000000-0000-4000-8000-000000000200';
const ADA = '00000000-0000-4000-8000-000000000001';

const manifest = manifestSchema.parse({
  id: 'time-tracking',
  name: 'name',
  description: 'name',
  apiVersion: '^1.0',
  needs: ['issue.read'],
  permissions: {},
  settings: { type: 'object', properties: {} },
  entities: {
    timeEntry: {
      attachedTo: 'issue',
      fields: {
        type: 'object',
        properties: {
          minutes: { type: 'integer', minimum: 1 },
          note: { type: 'string', maxLength: 20 },
        },
        required: ['minutes'],
      },
      limits: { perIssue: 2 },
    },
    budget: {
      attachedTo: 'project',
      fields: { type: 'object', properties: { days: { type: 'number' } }, required: ['days'] },
      limits: { perProject: 1 },
    },
  },
  messages: { en: { name: 'Time' }, fr: { name: 'Temps' } },
  actions: [],
  events: [],
});

function issue(id: string, projectId: string): IssueDetails {
  return {
    id,
    key: 'WEB-1',
    projectId,
    projectKey: 'WEB',
    title: 'Issue',
    description: '',
    status: { id: '00000000-0000-4000-8000-000000000201', name: 'Open', closes: false },
    category: { id: '00000000-0000-4000-8000-000000000301', name: 'Bug' },
    priority: { id: '00000000-0000-4000-8000-000000000401', name: 'Normal', level: 2 },
    assigneeId: null,
    reporterId: ADA,
    closedAt: null,
    createdAt: '2026-01-01T09:00:00.000Z',
    updatedAt: '2026-01-01T09:00:00.000Z',
  };
}

const OURS = '00000000-0000-4000-8000-000000000011';
const THEIRS = '00000000-0000-4000-8000-000000000022';

function store() {
  let last = 900;
  const records = createTestRecords(
    manifest,
    new Map([
      [OURS, issue(OURS, WEB)],
      [THEIRS, issue(THEIRS, OPS)],
    ]),
    () => `00000000-0000-4000-8000-000000000${++last}`,
  );
  // Ada sees WEB's issue only.
  const ada: Reader = { id: ADA, sees: (issueId) => issueId === OURS };
  const ask = (method: string, args: Record<string, unknown>, reader: Reader = ada) => {
    try {
      return records.answer(method, args, reader);
    } catch (error) {
      return { refused: error instanceof Error ? error.message : String(error) };
    }
  };
  return { records, ask };
}

describe('a fake Toppo’s records', () => {
  it('are kept on an issue someone sees, written by them, read, changed and deleted', () => {
    const { records, ask } = store();

    const kept = ask('entities.create', {
      entity: 'timeEntry',
      issueId: OURS,
      fields: { minutes: 30 },
    });
    expect(kept).toMatchObject({ issueId: OURS, projectId: WEB, createdBy: ADA });
    const id = (kept as { id: string }).id;
    expect(
      ask('entities.update', { entity: 'timeEntry', id, fields: { note: 'Review' } }),
    ).toMatchObject({ fields: { minutes: 30, note: 'Review' } });
    expect(ask('entities.get', { entity: 'timeEntry', id })).toMatchObject({ id });
    expect(records.of('timeEntry')).toHaveLength(1);
    expect(ask('entities.delete', { entity: 'timeEntry', id })).toBeNull();
    expect(ask('entities.get', { entity: 'timeEntry', id })).toBeNull();
    expect(ask('entities.delete', { entity: 'timeEntry', id })).toStrictEqual({
      refused: 'RECORD_NOT_FOUND',
    });
    expect(
      ask('entities.update', { entity: 'timeEntry', id, fields: { minutes: 1 } }),
    ).toStrictEqual({ refused: 'RECORD_NOT_FOUND' });
  });

  it.each([
    [
      'fields it does not declare',
      { entity: 'timeEntry', issueId: OURS, fields: { hours: 1 } },
      'RECORD_INVALID',
    ],
    [
      'a project for a record on an issue',
      { entity: 'timeEntry', projectId: WEB, fields: { minutes: 1 } },
      'RECORD_INVALID',
    ],
    [
      'an issue for a record on a project',
      { entity: 'budget', issueId: OURS, fields: { days: 1 } },
      'RECORD_INVALID',
    ],
    [
      'an issue not seen',
      { entity: 'timeEntry', issueId: THEIRS, fields: { minutes: 1 } },
      'NOT_FOUND',
    ],
    [
      'a project not reached',
      { entity: 'budget', projectId: OPS, fields: { days: 1 } },
      'NOT_FOUND',
    ],
    [
      'an entity it does not keep',
      { entity: 'estimate', issueId: OURS, fields: {} },
      'ENTITY_NOT_FOUND',
    ],
  ])('refuses %s', (_, args, refused) => {
    expect(store().ask('entities.create', args)).toStrictEqual({ refused });
  });

  it('stops at an entity’s limit, by issue or by project', () => {
    const { ask } = store();
    const entry = { entity: 'timeEntry', issueId: OURS, fields: { minutes: 5 } };
    const budget = { entity: 'budget', projectId: WEB, fields: { days: 5 } };

    ask('entities.create', entry);
    ask('entities.create', entry);
    ask('entities.create', budget);

    expect(ask('entities.create', entry)).toStrictEqual({ refused: 'RECORD_LIMIT_REACHED' });
    expect(ask('entities.create', budget)).toStrictEqual({ refused: 'RECORD_LIMIT_REACHED' });
  });

  it('lists, counts and sums what each sees, by group, the plugin itself seeing all', () => {
    const { ask } = store();
    ask('entities.create', { entity: 'timeEntry', issueId: OURS, fields: { minutes: 10 } });
    ask('entities.create', { entity: 'timeEntry', issueId: OURS, fields: { minutes: 20 } });
    ask('entities.create', { entity: 'timeEntry', issueId: THEIRS, fields: { minutes: 60 } }, null);

    expect(ask('entities.list', { entity: 'timeEntry', pageSize: 1 })).toMatchObject({
      items: [{ fields: { minutes: 20 } }],
      total: 2,
    });
    expect(
      ask('entities.list', { entity: 'timeEntry', order: 'oldest', where: { createdBy: ADA } }),
    ).toMatchObject({ items: [{ fields: { minutes: 10 } }, { fields: { minutes: 20 } }] });
    expect(
      ask('entities.aggregate', { entity: 'timeEntry', op: 'sum', field: 'minutes' }),
    ).toStrictEqual({ total: 30 });
    expect(
      ask(
        'entities.aggregate',
        { entity: 'timeEntry', op: 'sum', field: 'minutes', groupBy: 'createdBy' },
        null,
      ),
    ).toStrictEqual({
      total: 90,
      groups: [
        { key: TEST_PLUGIN_USER_ID, value: 60 },
        { key: ADA, value: 30 },
      ],
    });
    expect(
      ask('entities.aggregate', {
        entity: 'timeEntry',
        op: 'count',
        where: { issueId: OURS, projectId: WEB },
        groupBy: 'issueId',
      }),
    ).toStrictEqual({ total: 2, groups: [{ key: OURS, value: 2 }] });
    expect(
      ask('entities.aggregate', { entity: 'timeEntry', op: 'sum', field: 'note' }),
    ).toStrictEqual({ refused: 'RECORD_INVALID' });
  });

  it('counts by project the records on projects someone reaches', () => {
    const { ask } = store();
    ask('entities.create', { entity: 'budget', projectId: WEB, fields: { days: 20 } });
    ask('entities.create', { entity: 'budget', projectId: OPS, fields: { days: 5 } }, null);

    expect(
      ask('entities.aggregate', { entity: 'budget', op: 'count', groupBy: 'projectId' }),
    ).toStrictEqual({ total: 1, groups: [{ key: WEB, value: 1 }] });
  });
});
