import type { IssueActivity } from '@toppo/shared';
import { describe, expect, it } from 'vitest';
import { groupHistory } from './issue-history.util.ts';

const ADA = { id: '01a1569b-9900-7000-8000-000000000001', name: 'Ada' };
const GRACE = { id: '01a1569b-9900-7000-8000-000000000002', name: 'Grace' };

function change(id: string, actor: typeof ADA, createdAt: string): IssueActivity {
  return {
    id: `01a1569b-9900-7000-8000-0000000009${id}`,
    type: 'issue.titleChanged',
    actor,
    createdAt,
    payload: { from: 'a', to: 'b' },
  };
}

describe('groupHistory', () => {
  it('groups what one person changed at once, and nothing else', () => {
    const entries = groupHistory([
      change('01', ADA, '2026-10-22T09:14:00.000Z'),
      change('02', ADA, '2026-10-22T09:21:00.000Z'),
      change('03', ADA, '2026-10-22T09:21:00.000Z'),
      change('04', GRACE, '2026-10-22T09:21:00.000Z'),
    ]);

    expect(entries.map(({ actor, changes }) => [actor.name, changes.length])).toStrictEqual([
      ['Ada', 1],
      ['Ada', 2],
      ['Grace', 1],
    ]);
  });

  it('never groups a comment, even with what was changed at the same moment', () => {
    const comment: IssueActivity = {
      id: '01a1569b-9900-7000-8000-000000000990',
      type: 'issue.commented',
      actor: ADA,
      createdAt: '2026-10-22T09:21:00.000Z',
      payload: {
        comment: {
          id: ADA.id,
          body: 'Done',
          editedAt: null,
          attachments: [],
          mentions: [],
          actions: [],
        },
      },
    };

    const entries = groupHistory([
      change('01', ADA, '2026-10-22T09:21:00.000Z'),
      comment,
      change('02', ADA, '2026-10-22T09:21:00.000Z'),
    ]);

    expect(entries.map(({ changes }) => changes.length)).toStrictEqual([1, 1, 1]);
  });

  it('has nothing to show without activities', () => {
    expect(groupHistory([])).toStrictEqual([]);
  });
});
