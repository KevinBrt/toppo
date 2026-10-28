import { describe, expect, it } from 'vitest';
import { projectIssuesQuerySchema } from '../issues/issues.ts';
import {
  formatPropertyFilters,
  type PropertyFilter,
  parsePropertyFilters,
  propertyFiltersParameter,
} from './property-filters.ts';

const VERSION = '01a1569b-9900-7000-8000-000000000001';
const DUE = '01a1569b-9900-7000-8000-000000000002';
const V12 = '01a1569b-9900-7000-8000-000000000012';

describe('the property filters of a list', () => {
  it('read values or a range for each property, as the address keeps them', () => {
    const filters: PropertyFilter[] = [
      { propertyId: VERSION, values: [V12, 'none'] },
      { propertyId: DUE, from: '2026-11-01', to: null },
    ];
    const text = formatPropertyFilters(filters);

    expect(text).toBe(`${VERSION}:${V12},none;${DUE}:2026-11-01..`);
    expect(propertyFiltersParameter.parse(text)).toStrictEqual(filters);
    expect(propertyFiltersParameter.parse(`${DUE}:..-2.5`)).toStrictEqual([
      { propertyId: DUE, from: null, to: '-2.5' },
    ]);
  });

  it('take filters already split by a caller that is not HTTP', () => {
    const filters = [{ propertyId: VERSION, values: ['yes'] }];

    expect(propertyFiltersParameter.parse(filters)).toStrictEqual(filters);
  });

  it.each([
    ['no property', `:${V12}`],
    ['no values', `${VERSION}:`],
    ['a range open at both ends', `${DUE}:..`],
    ['a word it does not know', `${VERSION}:latest`],
    ['an end that is no number or day', `${DUE}:soon..`],
    ['a property filtered twice', `${VERSION}:none;${VERSION}:${V12}`],
  ])('refuse %s', (_, text) => {
    expect(propertyFiltersParameter.safeParse(text).success).toBe(false);
  });

  it('split filters only on semicolons and their first colon', () => {
    expect(parsePropertyFilters(`${VERSION}:a,b;;${DUE}:1..2`)).toStrictEqual([
      { propertyId: VERSION, values: ['a', 'b'] },
      { propertyId: DUE, from: '1', to: '2' },
    ]);
  });

  it('split a range on its last two dots', () => {
    expect(parsePropertyFilters(`${DUE}:1...5;${VERSION}:..-1;${DUE}:2026-11-01..`)).toStrictEqual([
      { propertyId: DUE, from: '1.', to: '5' },
      { propertyId: VERSION, from: null, to: '-1' },
      { propertyId: DUE, from: '2026-11-01', to: null },
    ]);
  });

  it('read a text full of dots in one pass, whoever wrote it', () => {
    // Backtracking over every `..` before failing at the newline took seconds on this text.
    const text = `${DUE}:${'..a'.repeat(50_000)}\n`;

    const started = performance.now();
    parsePropertyFilters(text);

    expect(performance.now() - started).toBeLessThan(250);
  });

  it('are a parameter of the list, left out when none is given', () => {
    expect(projectIssuesQuerySchema.parse({}).property).toBeUndefined();
    expect(projectIssuesQuerySchema.parse({ property: `${VERSION}:none` }).property).toStrictEqual([
      { propertyId: VERSION, values: ['none'] },
    ]);
  });
});
