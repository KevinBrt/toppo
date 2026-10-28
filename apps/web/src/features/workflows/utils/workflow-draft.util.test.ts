import { workflowRequestSchema } from '@toppo-tracker/shared';
import { describe, expect, it } from 'vitest';
import {
  allows,
  countChanges,
  draftOf,
  exitsOf,
  newStatusKey,
  removeStatus,
  requestOf,
  toggleMove,
  updateStatus,
} from './workflow-draft.util.ts';

const NEW = '01a1569b-9900-7000-8000-000000000001';
const DOING = '01a1569b-9900-7000-8000-000000000002';
const DONE = '01a1569b-9900-7000-8000-000000000003';

const saved = draftOf({
  mode: 'defined',
  statuses: [
    { id: NEW, name: 'New', color: 'blue', closes: false, isInitial: true, issueCount: 2 },
    {
      id: DOING,
      name: 'Doing',
      color: 'violet',
      closes: false,
      isInitial: false,
      issueCount: 1,
    },
    { id: DONE, name: 'Done', color: 'green', closes: true, isInitial: false, issueCount: 0 },
  ],
  transitions: [
    { from: NEW, to: DOING },
    { from: DOING, to: DONE },
  ],
});

describe('the workflow draft', () => {
  it('starts from the saved workflow, making no change', () => {
    expect(saved.initialKey).toBe(NEW);
    expect(exitsOf(saved, NEW)).toBe(1);
    expect(countChanges(saved, saved)).toBe(0);
    expect(workflowRequestSchema.safeParse(requestOf(saved)).success).toBe(true);
  });

  it('counts each move allowed or forbidden, and a move put back is no change', () => {
    const toggled = toggleMove(toggleMove(saved, NEW, DONE), DOING, DONE);

    expect(allows(toggled.moves, NEW, DONE)).toBe(true);
    expect(allows(toggled.moves, DOING, DONE)).toBe(false);
    expect(countChanges(saved, toggled)).toBe(2);
    expect(countChanges(saved, toggleMove(toggled, NEW, DONE))).toBe(1);
  });

  it('counts each status edited, added, a new order, a new initial status and mode', () => {
    const key = newStatusKey();
    const changed = {
      ...updateStatus(saved, DOING, { name: 'In progress' }),
      mode: 'free' as const,
      initialKey: DOING,
    };
    const withNew = {
      ...changed,
      statuses: [
        ...changed.statuses.toReversed(),
        {
          key,
          name: 'Review',
          color: 'pink' as const,
          closes: false,
          issueCount: 0,
          shared: false,
        },
      ],
    };

    expect(countChanges(saved, withNew)).toBe(5);
    const request = requestOf(withNew);
    expect(request.statuses.map(({ ref, isInitial }) => [ref, isInitial])).toStrictEqual([
      [DONE, false],
      [DOING, true],
      [NEW, false],
      [key, false],
    ]);
    expect(workflowRequestSchema.safeParse(request).success).toBe(true);
  });

  it('takes a status out with its moves, its issues going where chosen', () => {
    const removed = removeStatus(saved, DOING, DONE);

    expect(removed.statuses.map(({ key }) => key)).toStrictEqual([NEW, DONE]);
    expect(removed.moves).toStrictEqual([]);
    expect(removed.removed).toStrictEqual([{ statusId: DOING, moveTo: DONE }]);
    expect(countChanges(saved, removed)).toBe(1);
    expect(workflowRequestSchema.safeParse(requestOf(removed)).success).toBe(true);
  });

  it('sends issues headed for a status taken out after it on to its own destination', () => {
    const twice = removeStatus(removeStatus(saved, DOING, DONE), DONE, NEW);

    expect(twice.removed).toStrictEqual([
      { statusId: DOING, moveTo: NEW },
      { statusId: DONE, moveTo: NEW },
    ]);
  });

  it('forgets a status added then taken out before saving', () => {
    const key = newStatusKey();
    const added = {
      ...saved,
      statuses: [
        ...saved.statuses,
        {
          key,
          name: 'Review',
          color: 'pink' as const,
          closes: false,
          issueCount: 0,
          shared: false,
        },
      ],
    };

    expect(removeStatus(added, key, NEW).removed).toStrictEqual([]);
  });
});
