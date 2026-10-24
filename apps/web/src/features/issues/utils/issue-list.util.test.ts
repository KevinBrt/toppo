import { describe, expect, it } from 'vitest';
import { issueListSearchSchema } from '../models/issue-list.model.ts';
import {
  firstPageOf,
  isNarrowed,
  issuesQueryOf,
  orderOf,
  searchOf,
  sortedAs,
  sortedBy,
  withoutFilters,
  withPropertyFilter,
} from './issue-list.util.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';
const OTHER = '01a1569b-9900-7000-8000-000000000002';

describe('issuesQueryOf', () => {
  it('shows the open issues, newest first, by default', () => {
    expect(issuesQueryOf(issueListSearchSchema.parse({ project: 'WEB' }))).toStrictEqual({
      page: undefined,
      search: undefined,
      state: 'open',
      status: undefined,
      priority: undefined,
      category: undefined,
      label: undefined,
      assignee: undefined,
      reporter: undefined,
      property: undefined,
      sort: undefined,
      order: undefined,
      group: undefined,
    });
  });

  it('reads the lists of the address, keeping only what makes sense, each once', () => {
    const query = issuesQueryOf(
      issueListSearchSchema.parse({
        state: 'all',
        status: `${ID},not-an-id,${ID},${OTHER}`,
        assignee: 'me,none,someone',
        reporter: 'none,me',
        q: 'crash',
      }),
    );

    expect(query).toMatchObject({
      state: undefined,
      status: [ID, OTHER],
      assignee: ['me', 'none'],
      reporter: ['me'],
      search: 'crash',
    });
  });

  it('drops what the address cannot hold', () => {
    expect(
      issueListSearchSchema.parse({ state: 'archived', sort: 'name', order: 'up', page: '0' }),
    ).toEqual({});
    expect(issuesQueryOf({ property: `${ID}:latest` }).property).toBeUndefined();
  });
});

describe('withPropertyFilter', () => {
  it('sets, replaces and takes away the filter of one property, from the first page', () => {
    const query = { page: 3, property: [{ propertyId: ID, values: ['none'] }] };
    const range = { propertyId: OTHER, from: '2', to: null };

    expect(withPropertyFilter(query, OTHER, range)).toStrictEqual({
      page: undefined,
      property: [{ propertyId: ID, values: ['none'] }, range],
    });
    expect(
      withPropertyFilter(query, ID, { propertyId: ID, values: [OTHER] }).property,
    ).toStrictEqual([{ propertyId: ID, values: [OTHER] }]);
    expect(withPropertyFilter(query, ID, null).property).toBeUndefined();
    expect(isNarrowed({ state: 'open', property: [range] })).toBe(true);
  });
});

describe('searchOf', () => {
  it('keeps in the address only what differs from the default list', () => {
    expect(
      searchOf({ state: 'open', sort: 'key', order: 'desc', page: 1, status: [] }),
    ).toStrictEqual({
      page: undefined,
      q: undefined,
      state: undefined,
      status: undefined,
      priority: undefined,
      category: undefined,
      label: undefined,
      assignee: undefined,
      reporter: undefined,
      property: undefined,
      sort: undefined,
      order: undefined,
      group: undefined,
    });
  });

  it('round-trips through the address', () => {
    const search = {
      page: 2,
      q: 'crash',
      state: 'closed',
      status: `${ID},${OTHER}`,
      priority: undefined,
      category: ID,
      label: OTHER,
      assignee: 'me,none',
      reporter: undefined,
      property: `${ID}:none;${OTHER}:2..`,
      sort: 'priority',
      order: 'asc',
      group: 'status',
    } as const;

    expect(searchOf(issuesQueryOf(search))).toStrictEqual(search);
    expect(searchOf(issuesQueryOf({ state: 'all' })).state).toBe('all');
  });
});

describe('sorting', () => {
  it('sorts by a column in its own order first, then the other way round', () => {
    const byTitle = sortedBy({ page: 3 }, 'title');
    const reversed = sortedBy(byTitle, 'title');

    expect(byTitle).toStrictEqual({ page: undefined, sort: 'title', order: undefined });
    expect(orderOf(byTitle)).toBe('asc');
    expect(reversed).toMatchObject({ sort: 'title', order: 'desc' });
    expect(sortedBy(reversed, 'title').order).toBeUndefined();
  });

  it('starts another column in its own order, whatever the order before', () => {
    const byPriority = sortedBy({ sort: 'title', order: 'desc' }, 'priority');

    expect(byPriority).toMatchObject({ sort: 'priority', order: undefined });
    expect(orderOf(byPriority)).toBe('desc');
    expect(orderOf({})).toBe('desc');
  });

  it('names the order only when not the sort’s own', () => {
    expect(sortedAs({}, 'status', 'asc').order).toBeUndefined();
    expect(sortedAs({}, 'status', 'desc').order).toBe('desc');
  });
});

describe('isNarrowed', () => {
  it('tells a search, a filter or another state from the default list', () => {
    expect(isNarrowed({ state: 'open', sort: 'priority', group: 'status' })).toBe(false);
    expect(isNarrowed({ state: 'open', search: 'crash' })).toBe(true);
    expect(isNarrowed({ state: 'open', assignee: ['me'] })).toBe(true);
    expect(isNarrowed({})).toBe(true);
  });

  it('goes back to the default list, sorted and grouped as it was', () => {
    const query = {
      state: 'closed',
      status: [ID],
      sort: 'key',
      order: 'asc',
      group: 'assignee',
    } as const;

    expect(withoutFilters(query)).toStrictEqual({
      state: 'open',
      sort: 'key',
      order: 'asc',
      group: 'assignee',
    });
    expect(firstPageOf({ ...query, page: 3 }, { sort: 'updated' })).toStrictEqual({
      ...query,
      sort: 'updated',
      page: undefined,
    });
  });
});
