import { PROPERTY_TYPES } from '@toppo/shared';
import { describe, expect, it } from 'vitest';
import {
  creationValuesOf,
  optionsIn,
  type PropertyRules,
  peopleNamedIn,
  propertyValueOf,
  withPropertyValue,
} from './property-values.ts';

const V12 = '01a1569b-9900-7000-8000-000000000012';
const V13 = '01a1569b-9900-7000-8000-000000000013';
const WEB = '01a1569b-9900-7000-8000-000000000021';
const API = '01a1569b-9900-7000-8000-000000000022';
const ADA = '01a1569b-9900-7000-8000-000000000031';

const rules = (
  id: string,
  type: PropertyRules['type'],
  overrides: Partial<PropertyRules> = {},
) => ({
  id,
  type,
  askedAtCreation: true,
  required: false,
  optionIds: [],
  ...overrides,
});

const version = rules('version', 'list', { required: true, optionIds: [V12, V13] });
const teams = rules('teams', 'multiSelect', { optionIds: [WEB, API] });
const customer = rules('customer', 'text', { askedAtCreation: false });
const estimate = rules('estimate', 'number');
const due = rules('due', 'date');
const reviewer = rules('reviewer', 'user');
const regression = rules('regression', 'checkbox');
const properties = [version, teams, customer, estimate, due, reviewer, regression];

describe('the value a property takes', () => {
  it('is one of its options for a list, some of them for a multi-select', () => {
    expect(propertyValueOf(version, V13)).toStrictEqual({ value: V13 });
    expect(propertyValueOf(teams, [API, WEB])).toStrictEqual({ value: [API, WEB] });
    expect(propertyValueOf(version, WEB)).toStrictEqual({
      problem: 'unknownOption',
      propertyId: 'version',
    });
    expect(propertyValueOf(teams, [WEB, V12])).toStrictEqual({
      problem: 'unknownOption',
      propertyId: 'teams',
    });
  });

  it('is a line of text, trimmed; a number; a day; someone; a box ticked', () => {
    expect(propertyValueOf(customer, ' ACME ')).toStrictEqual({ value: 'ACME' });
    expect(propertyValueOf(estimate, 2.5)).toStrictEqual({ value: 2.5 });
    expect(propertyValueOf(due, '2026-10-24')).toStrictEqual({ value: '2026-10-24' });
    expect(propertyValueOf(reviewer, ADA)).toStrictEqual({ value: ADA });
    expect(propertyValueOf(regression, true)).toStrictEqual({ value: true });
  });

  it.each([
    [version, [V12]],
    [teams, V12],
    [customer, 42],
    [estimate, '2.5'],
    [due, '24/10/2026'],
    [reviewer, 'Ada'],
    [regression, false],
  ])('refuses a value of another shape for %o', (property, value) => {
    expect(propertyValueOf(property, value)).toStrictEqual({
      problem: 'invalidValue',
      propertyId: property.id,
    });
  });
});

describe('the options a value chooses', () => {
  it('are those of a list or a multi-select, never of another type', () => {
    expect(optionsIn('list', V12)).toStrictEqual([V12]);
    expect(optionsIn('multiSelect', [V12, V13])).toStrictEqual([V12, V13]);
    for (const type of PROPERTY_TYPES.filter((t) => t !== 'list' && t !== 'multiSelect')) {
      expect(optionsIn(type, V12)).toStrictEqual([]);
    }
  });
});

describe('the values an issue is created with', () => {
  it('may give any property, as stored, those required at creation being given', () => {
    expect(creationValuesOf(properties, { version: V13 })).toStrictEqual({
      values: { version: V13 },
    });
    expect(
      creationValuesOf(properties, {
        version: V12,
        teams: [WEB],
        customer: ' ACME ',
        estimate: 3,
        due: '2026-11-02',
        reviewer: ADA,
        regression: true,
      }),
    ).toStrictEqual({
      values: {
        version: V12,
        teams: [WEB],
        customer: 'ACME',
        estimate: 3,
        due: '2026-11-02',
        reviewer: ADA,
        regression: true,
      },
    });
  });

  it('must give the properties required at creation', () => {
    expect(creationValuesOf(properties, { teams: [WEB] })).toStrictEqual({
      problem: 'missingRequired',
      propertyId: 'version',
    });
    expect(creationValuesOf([teams, customer], {})).toStrictEqual({ values: {} });
  });

  it('refuses a property the project lacks, an unknown option, a value of another type', () => {
    expect(creationValuesOf(properties, { version: V13, size: 'xl' })).toStrictEqual({
      problem: 'unknownProperty',
      propertyId: 'size',
    });
    expect(creationValuesOf(properties, { version: WEB })).toStrictEqual({
      problem: 'unknownOption',
      propertyId: 'version',
    });
    expect(creationValuesOf(properties, { version: V12, estimate: 'three' })).toStrictEqual({
      problem: 'invalidValue',
      propertyId: 'estimate',
    });
  });
});

describe('the people values name', () => {
  it('are those of the person properties, never an id another property holds', () => {
    expect(peopleNamedIn(properties, { version: V12, reviewer: ADA })).toStrictEqual([ADA]);
    expect(peopleNamedIn(properties, { version: V12 })).toStrictEqual([]);
  });
});

describe('an issue given a value', () => {
  it('keeps the others, and loses the property once given none', () => {
    const values = { version: V12, teams: [WEB] };

    expect(withPropertyValue(values, 'version', V13)).toStrictEqual({ version: V13, teams: [WEB] });
    expect(withPropertyValue(values, 'version', null)).toStrictEqual({ teams: [WEB] });
    expect(withPropertyValue({}, 'regression', true)).toStrictEqual({ regression: true });
    expect(values).toStrictEqual({ version: V12, teams: [WEB] });
  });
});
