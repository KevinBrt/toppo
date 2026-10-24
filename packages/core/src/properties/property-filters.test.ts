import { describe, expect, it } from 'vitest';
import { meetsCondition, propertyConditionOf } from './property-filters.ts';

const V12 = '01a1569b-9900-7000-8000-000000000012';
const V13 = '01a1569b-9900-7000-8000-000000000013';
const ADA = '01a1569b-9900-7000-8000-000000000031';
const ME = '01a1569b-9900-7000-8000-000000000032';

const of = (type: Parameters<typeof propertyConditionOf>[0]['type']) => ({ id: 'p', type });

describe('what a filter keeps of a property', () => {
  it('is any of some options, or no value, for a list or a multi-select', () => {
    expect(propertyConditionOf(of('list'), { propertyId: 'p', values: [V12, 'none'] }, ME)).toEqual(
      { kind: 'any', propertyId: 'p', ids: [V12], none: true, several: false },
    );
    expect(propertyConditionOf(of('multiSelect'), { propertyId: 'p', values: [V12] }, ME)).toEqual({
      kind: 'any',
      propertyId: 'p',
      ids: [V12],
      none: false,
      several: true,
    });
    expect(propertyConditionOf(of('list'), { propertyId: 'p', values: ['me'] }, ME)).toBeNull();
  });

  it('is any of some people, the caller standing for `me`', () => {
    expect(
      propertyConditionOf(of('user'), { propertyId: 'p', values: ['me', ADA, ME] }, ME),
    ).toEqual({ kind: 'any', propertyId: 'p', ids: [ME, ADA], none: false, several: false });
  });

  it('is a box ticked or not, never both', () => {
    expect(propertyConditionOf(of('checkbox'), { propertyId: 'p', values: ['no'] }, ME)).toEqual({
      kind: 'ticked',
      propertyId: 'p',
      ticked: false,
    });
    expect(
      propertyConditionOf(of('checkbox'), { propertyId: 'p', values: ['yes', 'no'] }, ME),
    ).toBeNull();
    expect(propertyConditionOf(of('checkbox'), { propertyId: 'p', values: [V12] }, ME)).toBeNull();
  });

  it('is a range of numbers or of days, open on one side', () => {
    expect(
      propertyConditionOf(of('number'), { propertyId: 'p', from: '-2.5', to: null }, ME),
    ).toEqual({ kind: 'between', propertyId: 'p', type: 'number', from: -2.5, to: null });
    expect(
      propertyConditionOf(of('date'), { propertyId: 'p', from: null, to: '2026-11-02' }, ME),
    ).toEqual({ kind: 'between', propertyId: 'p', type: 'date', from: null, to: '2026-11-02' });
    expect(
      propertyConditionOf(of('number'), { propertyId: 'p', from: '1e999', to: null }, ME),
    ).toBeNull();
    expect(
      propertyConditionOf(of('date'), { propertyId: 'p', from: '2026-02-30', to: null }, ME),
    ).toBeNull();
  });

  it('never filters a line of text, nor a range of what is not a number or a day', () => {
    expect(propertyConditionOf(of('text'), { propertyId: 'p', values: ['none'] }, ME)).toBeNull();
    expect(propertyConditionOf(of('list'), { propertyId: 'p', from: '1', to: '2' }, ME)).toBeNull();
    expect(propertyConditionOf(of('number'), { propertyId: 'p', values: [V12] }, ME)).toBeNull();
  });
});

describe('a value meeting a condition', () => {
  it('is one of the options or people, or none when none passes', () => {
    const condition = {
      kind: 'any',
      propertyId: 'p',
      ids: [V12],
      none: true,
      several: true,
    } as const;

    expect(meetsCondition(condition, [V13, V12])).toBe(true);
    expect(meetsCondition(condition, V12)).toBe(true);
    expect(meetsCondition(condition, [V13])).toBe(false);
    expect(meetsCondition(condition, undefined)).toBe(true);
    expect(meetsCondition({ ...condition, none: false }, undefined)).toBe(false);
  });

  it('is a box as the condition wants it, no value being unticked', () => {
    const unticked = { kind: 'ticked', propertyId: 'p', ticked: false } as const;

    expect(meetsCondition(unticked, undefined)).toBe(true);
    expect(meetsCondition(unticked, true)).toBe(false);
    expect(meetsCondition({ ...unticked, ticked: true }, true)).toBe(true);
  });

  it('is a number or a day within the range, its ends included', () => {
    const numbers = { kind: 'between', propertyId: 'p', type: 'number', from: 2, to: 5 } as const;
    const days = {
      kind: 'between',
      propertyId: 'p',
      type: 'date',
      from: '2026-11-01',
      to: null,
    } as const;

    expect(meetsCondition(numbers, 5)).toBe(true);
    expect(meetsCondition(numbers, 5.5)).toBe(false);
    expect(meetsCondition(numbers, undefined)).toBe(false);
    expect(meetsCondition(numbers, '3')).toBe(false);
    expect(meetsCondition(days, '2026-11-01')).toBe(true);
    expect(meetsCondition(days, '2026-10-31')).toBe(false);
    expect(meetsCondition(days, 3)).toBe(false);
  });
});
