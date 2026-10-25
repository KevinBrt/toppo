import { describe, expect, it } from 'vitest';
import { followersOf, recipientsOf } from './recipients.ts';

const people = {
  reporterId: 'rita',
  assigneeId: 'grace',
  commenterIds: ['alan', 'rita', 'ada'],
  followerIds: [],
  unfollowerIds: [],
};

describe('followersOf', () => {
  it('is those who take part, unless they stopped, and those who chose to follow, each once', () => {
    expect(followersOf(people)).toStrictEqual(['rita', 'grace', 'alan', 'ada']);
    expect(
      followersOf({ ...people, followerIds: ['linus', 'alan'], unfollowerIds: ['rita'] }),
    ).toStrictEqual(['grace', 'alan', 'ada', 'linus']);
    expect(followersOf({ ...people, assigneeId: null, commenterIds: [] })).toStrictEqual(['rita']);
  });
});

describe('recipientsOf', () => {
  it('tells of a new issue its assignee, then those whose role asks for it, never its reporter', () => {
    expect(
      recipientsOf(
        {
          type: 'issue.created',
          actorId: 'rita',
          assigneeId: 'grace',
          subscriberIds: ['grace', 'alan', 'rita'],
        },
        people,
      ),
    ).toStrictEqual(
      new Map([
        ['grace', 'assigned'],
        ['alan', 'newIssue'],
      ]),
    );
    expect(
      recipientsOf(
        { type: 'issue.created', actorId: 'rita', assigneeId: null, subscriberIds: [] },
        people,
      ).size,
    ).toBe(0);
  });

  it('tells the person an issue is given to, then its followers and the assignee it had', () => {
    expect(
      recipientsOf(
        {
          type: 'issue.assigneeChanged',
          actorId: 'ada',
          assigneeId: 'grace',
          previousAssigneeId: 'linus',
        },
        { ...people, followerIds: ['mary'] },
      ),
    ).toStrictEqual(
      new Map([
        ['grace', 'assigned'],
        ['rita', 'participating'],
        ['alan', 'participating'],
        ['linus', 'participating'],
        ['mary', 'following'],
      ]),
    );
  });

  it('tells of an assignment as it left the issue, whoever has it by the time people are told', () => {
    expect(
      recipientsOf(
        {
          type: 'issue.assigneeChanged',
          actorId: 'ada',
          assigneeId: null,
          previousAssigneeId: 'linus',
        },
        { ...people, assigneeId: 'mary' },
      ),
    ).toStrictEqual(
      new Map([
        ['rita', 'participating'],
        ['alan', 'participating'],
        ['linus', 'participating'],
      ]),
    );
  });

  it('tells nobody who stopped following of an assignment, unless it is theirs', () => {
    expect(
      recipientsOf(
        {
          type: 'issue.assigneeChanged',
          actorId: 'ada',
          assigneeId: 'grace',
          previousAssigneeId: 'linus',
        },
        { ...people, unfollowerIds: ['grace', 'linus', 'rita', 'alan'] },
      ),
    ).toStrictEqual(new Map([['grace', 'assigned']]));
  });

  it('tells followers of a new comment, those it names first, never its author', () => {
    expect(
      recipientsOf(
        { type: 'issue.commented', actorId: 'ada', mentioned: ['grace', 'linus'] },
        { ...people, followerIds: ['mary'], unfollowerIds: ['alan'] },
      ),
    ).toStrictEqual(
      new Map([
        ['grace', 'mentioned'],
        ['linus', 'mentioned'],
        ['rita', 'participating'],
        ['mary', 'following'],
      ]),
    );
  });

  it('tells only those an edited comment newly names', () => {
    expect(
      recipientsOf({ type: 'issue.commentEdited', actorId: 'ada', mentioned: ['linus'] }, people),
    ).toStrictEqual(new Map([['linus', 'mentioned']]));
  });

  it('tells followers of a status change', () => {
    expect(recipientsOf({ type: 'issue.statusChanged', actorId: 'alan' }, people)).toStrictEqual(
      new Map([
        ['rita', 'participating'],
        ['grace', 'participating'],
        ['ada', 'participating'],
      ]),
    );
    expect(
      recipientsOf(
        { type: 'issue.statusChanged', actorId: 'rita' },
        { ...people, assigneeId: null, commenterIds: [] },
      ).size,
    ).toBe(0);
  });

  it('tells followers of a duplicate mark, those who stopped following left out', () => {
    expect(
      recipientsOf(
        { type: 'issue.duplicateChanged', actorId: 'alan' },
        { ...people, followerIds: ['mary'], unfollowerIds: ['grace'] },
      ),
    ).toStrictEqual(
      new Map([
        ['rita', 'participating'],
        ['ada', 'participating'],
        ['mary', 'following'],
      ]),
    );
  });

  it('tells nobody of anything else', () => {
    expect(recipientsOf({ type: 'other', actorId: 'ada' }, people).size).toBe(0);
  });
});
