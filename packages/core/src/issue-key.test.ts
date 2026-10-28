import { PROJECT_KEY_MAX_LENGTH, type ProjectKey, projectKeySchema } from '@toppo-tracker/shared';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatIssueKey, issueReferenceIn, issueReferencesIn, parseIssueKey } from './issue-key.ts';

const key = (value: string): ProjectKey => projectKeySchema.parse(value);

const projectKeyArbitrary = fc
  .tuple(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
    fc.string({
      unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
      minLength: 1,
      maxLength: PROJECT_KEY_MAX_LENGTH - 1,
    }),
  )
  .map(([first, rest]) => key(first + rest));

describe('formatIssueKey', () => {
  it('joins the project key and the number', () => {
    expect(formatIssueKey({ projectKey: key('WEB'), number: 42 })).toBe('WEB-42');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects number %s', (number) => {
    expect(() => formatIssueKey({ projectKey: key('WEB'), number })).toThrow(RangeError);
  });
});

describe('parseIssueKey', () => {
  it.each([
    ['WEB-42', 'WEB', 42],
    ['web-42', 'WEB', 42],
    ['  API2-7 ', 'API2', 7],
  ])('parses %j', (input, projectKey, number) => {
    expect(parseIssueKey(input)).toStrictEqual({ projectKey, number });
  });

  it.each([
    '',
    'WEB',
    'WEB-',
    'WEB-0',
    'WEB-042',
    'WEB-1.5',
    'WEB--1',
    '-42',
    '1WEB-42',
    'WEB-42-1',
    'W-42',
    'WEB-99999999999999999999',
  ])('returns null for %j', (input) => {
    expect(parseIssueKey(input)).toBeNull();
  });

  it('round-trips any valid key and number', () => {
    fc.assert(
      fc.property(
        projectKeyArbitrary,
        fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
        (projectKey, number) => {
          expect(parseIssueKey(formatIssueKey({ projectKey, number }))).toStrictEqual({
            projectKey,
            number,
          });
        },
      ),
    );
  });

  it('never throws, whatever the input', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(() => parseIssueKey(input)).not.toThrow();
      }),
    );
  });
});

describe('issueReferenceIn', () => {
  it.each([
    ['WEB-42', { projectKey: 'WEB', number: 42 }],
    [' web-42 ', { projectKey: 'WEB', number: 42 }],
    ['42', { projectKey: null, number: 42 }],
    ['#7', { projectKey: null, number: 7 }],
    ['999999999', { projectKey: null, number: 999_999_999 }],
  ])('reads %j', (search, reference) => {
    expect(issueReferenceIn(search)).toStrictEqual(reference);
  });

  it.each(['', 'broken link', 'WEB', '0', '042', '#', '4 2', '1000000000', 'WEB-1000000000'])(
    'finds no issue named in %j',
    (search) => {
      expect(issueReferenceIn(search)).toBeNull();
    },
  );

  it('never throws, whatever the search', () => {
    fc.assert(
      fc.property(fc.string(), (search) => {
        expect(() => issueReferenceIn(search)).not.toThrow();
      }),
    );
  });
});

describe('issueReferencesIn', () => {
  it.each([
    ['WEB-42', [{ projectKey: 'WEB', number: 42 }]],
    ['#7', [{ projectKey: null, number: 7 }]],
    ['web 42', [{ projectKey: 'WEB', number: 42 }]],
    ['WEB_42', [{ projectKey: 'WEB', number: 42 }]],
    [
      'web42',
      [
        { projectKey: 'WEB', number: 42 },
        { projectKey: 'WEB4', number: 2 },
      ],
    ],
    ['A1B07', [{ projectKey: 'A1B0', number: 7 }]],
  ])('reads %j every way it may be meant', (search, references) => {
    expect(issueReferencesIn(search)).toStrictEqual(references);
  });

  it.each(['', 'broken link', 'WEB', 'W 42', 'WEB 042', 'WEB0', 'export 2 files'])(
    'finds no issue named in %j',
    (search) => {
      expect(issueReferencesIn(search)).toStrictEqual([]);
    },
  );

  it('names only keys and numbers an issue can carry, whatever the search', () => {
    fc.assert(
      fc.property(fc.string(), (search) => {
        for (const { projectKey, number } of issueReferencesIn(search)) {
          expect(projectKey === null || projectKeySchema.safeParse(projectKey).success).toBe(true);
          expect(Number.isSafeInteger(number) && number > 0).toBe(true);
        }
      }),
    );
  });
});
