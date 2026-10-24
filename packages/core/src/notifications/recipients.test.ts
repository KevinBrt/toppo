import { describe, expect, it } from 'vitest';
import { recipientsOf } from './recipients.ts';

const people = { reporterId: 'rita', assigneeId: 'grace', commenterIds: ['alan', 'rita', 'ada'] };

describe('recipientsOf', () => {
  it('tells the person an issue is given to, unless they took it themselves', () => {
    expect(
      recipientsOf({ type: 'issue.assigneeChanged', actorId: 'ada', assigneeId: 'grace' }, people),
    ).toStrictEqual(new Map([['grace', 'assigned']]));
    expect(
      recipientsOf({ type: 'issue.assigneeChanged', actorId: 'grace', assigneeId: 'grace' }, people)
        .size,
    ).toBe(0);
    expect(
      recipientsOf({ type: 'issue.assigneeChanged', actorId: 'ada', assigneeId: null }, people)
        .size,
    ).toBe(0);
  });

  it('tells everyone involved of a new comment, those it names first, never its author', () => {
    expect(
      recipientsOf(
        { type: 'issue.commented', actorId: 'ada', mentioned: ['grace', 'linus'] },
        people,
      ),
    ).toStrictEqual(
      new Map([
        ['grace', 'mentioned'],
        ['linus', 'mentioned'],
        ['rita', 'participating'],
        ['alan', 'participating'],
      ]),
    );
  });

  it('tells only those an edited comment newly names', () => {
    expect(
      recipientsOf({ type: 'issue.commentEdited', actorId: 'ada', mentioned: ['linus'] }, people),
    ).toStrictEqual(new Map([['linus', 'mentioned']]));
  });

  it('tells the reporter and the assignee of a status change', () => {
    expect(recipientsOf({ type: 'issue.statusChanged', actorId: 'alan' }, people)).toStrictEqual(
      new Map([
        ['rita', 'participating'],
        ['grace', 'participating'],
      ]),
    );
    expect(
      recipientsOf(
        { type: 'issue.statusChanged', actorId: 'rita' },
        { ...people, assigneeId: null },
      ).size,
    ).toBe(0);
  });

  it('tells nobody of anything else', () => {
    expect(recipientsOf({ type: 'other', actorId: 'ada' }, people).size).toBe(0);
  });
});
