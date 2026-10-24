import { describe, expect, it } from 'vitest';
import {
  propertyChangeOf,
  samePropertyValue,
  withOptionsMoved,
  withoutOptions,
} from './property-changes.ts';

const V12 = '01a1569b-9900-7000-8000-000000000012';
const V13 = '01a1569b-9900-7000-8000-000000000013';
const GONE = '01a1569b-9900-7000-8000-000000000019';
const ADA = '01a1569b-9900-7000-8000-000000000031';
const names = new Map([
  [V12, '1.2'],
  [V13, '1.3'],
]);

const property = (type: Parameters<typeof propertyChangeOf>[0]['type']) => ({
  id: 'p',
  name: 'Field',
  type,
});
const ref = { id: 'p', name: 'Field' };

describe('a change of a property, as history keeps it', () => {
  it('names the options of a list or a multi-select as they are now', () => {
    expect(propertyChangeOf(property('list'), V12, V13, names)).toStrictEqual({
      type: 'list',
      property: ref,
      from: { id: V12, name: '1.2' },
      to: { id: V13, name: '1.3' },
    });
    expect(propertyChangeOf(property('multiSelect'), [V12], [V12, V13], names)).toStrictEqual({
      type: 'multiSelect',
      property: ref,
      from: [{ id: V12, name: '1.2' }],
      to: [
        { id: V12, name: '1.2' },
        { id: V13, name: '1.3' },
      ],
    });
  });

  it('reads an option no longer known as no value', () => {
    expect(propertyChangeOf(property('list'), GONE, V12, names)).toMatchObject({ from: null });
    expect(propertyChangeOf(property('multiSelect'), [GONE], null, names)).toMatchObject({
      from: null,
      to: null,
    });
  });

  it('keeps any other value as it is, someone by id', () => {
    expect(propertyChangeOf(property('text'), null, 'ACME', names)).toStrictEqual({
      type: 'text',
      property: ref,
      from: null,
      to: 'ACME',
    });
    expect(propertyChangeOf(property('number'), 2, 3.5, names)).toMatchObject({ from: 2, to: 3.5 });
    expect(propertyChangeOf(property('date'), '2026-10-24', null, names)).toMatchObject({
      from: '2026-10-24',
      to: null,
    });
    expect(propertyChangeOf(property('user'), null, ADA, names)).toMatchObject({
      type: 'user',
      to: ADA,
    });
    expect(propertyChangeOf(property('checkbox'), null, true, names)).toMatchObject({
      from: null,
      to: true,
    });
  });

  it('never keeps a value of another type than the property', () => {
    expect(propertyChangeOf(property('number'), 'three', true, names)).toMatchObject({
      from: null,
      to: null,
    });
    expect(propertyChangeOf(property('checkbox'), 'yes', null, names)).toMatchObject({
      from: null,
    });
    expect(propertyChangeOf(property('text'), 3, null, names)).toMatchObject({ from: null });
  });
});

describe('two values', () => {
  it('say the same when equal, the options of a multi-select in any order', () => {
    expect(samePropertyValue(V12, V12)).toBe(true);
    expect(samePropertyValue([V12, V13], [V13, V12])).toBe(true);
    expect(samePropertyValue([V12], [V12, V13])).toBe(false);
    expect(samePropertyValue([V12, V12], [V12, V13])).toBe(false);
    expect(samePropertyValue(null, null)).toBe(true);
    expect(samePropertyValue(3, null)).toBe(false);
  });
});

describe('a value once options are replaced by copies', () => {
  const COPY = '01a1569b-9900-7000-8000-000000000099';
  const moves = new Map([[V12, COPY]]);

  it('takes the copy of each option it chooses, keeping the others', () => {
    expect(withOptionsMoved('list', V12, moves)).toBe(COPY);
    expect(withOptionsMoved('list', V13, moves)).toBe(V13);
    expect(withOptionsMoved('multiSelect', [V13, V12], moves)).toStrictEqual([V13, COPY]);
  });

  it('leaves a value of another type as it is', () => {
    expect(withOptionsMoved('text', V12, moves)).toBe(V12);
  });
});

describe('a value once options leave it', () => {
  it('is none for a list that had one of them', () => {
    expect(withoutOptions('list', V12, [V12])).toBeNull();
    expect(withoutOptions('list', V13, [V12])).toBe(V13);
  });

  it('keeps the other options of a multi-select, none once it has none left', () => {
    expect(withoutOptions('multiSelect', [V12, V13], [V12])).toStrictEqual([V13]);
    expect(withoutOptions('multiSelect', [V12], [V12])).toBeNull();
  });

  it('leaves a value of another type as it is', () => {
    expect(withoutOptions('text', 'ACME', [V12])).toBe('ACME');
  });
});
