import { describe, expect, it } from 'vitest';
import { ISSUE_ACTIVITY_PAYLOADS, issueActivitySchema } from '../issues/activities.ts';
import {
  issuePropertyRequestSchema,
  PROPERTY_NUMBER_MAX,
  PROPERTY_TEXT_MAX_LENGTH,
  PROPERTY_VALUE_SCHEMAS,
} from './property-values.ts';

const ID = '01a1569b-9900-7000-8000-000000000001';
const OTHER = '01a1569b-9900-7000-8000-000000000002';

const takes = (type: keyof typeof PROPERTY_VALUE_SCHEMAS, value: unknown) =>
  PROPERTY_VALUE_SCHEMAS[type].safeParse(value).success;

describe('the value of a property', () => {
  it('is one option of a list', () => {
    expect(takes('list', ID)).toBe(true);
    expect(takes('list', [ID])).toBe(false);
    expect(takes('list', 'v1')).toBe(false);
  });

  it('is one or more options of a multi-select, each once', () => {
    expect(takes('multiSelect', [ID, OTHER])).toBe(true);
    expect(takes('multiSelect', [])).toBe(false);
    expect(takes('multiSelect', [ID, ID])).toBe(false);
    expect(takes('multiSelect', ID)).toBe(false);
  });

  it('is a line of text, trimmed, never blank or overlong', () => {
    expect(PROPERTY_VALUE_SCHEMAS.text.parse('  CUST-42 ')).toBe('CUST-42');
    expect(takes('text', '   ')).toBe(false);
    expect(takes('text', 'First line\nSecond line')).toBe(false);
    expect(takes('text', 'a'.repeat(PROPERTY_TEXT_MAX_LENGTH))).toBe(true);
    expect(takes('text', 'a'.repeat(PROPERTY_TEXT_MAX_LENGTH + 1))).toBe(false);
  });

  it('is a number JSON keeps whole, decimals allowed', () => {
    expect(takes('number', 3.5)).toBe(true);
    expect(takes('number', -PROPERTY_NUMBER_MAX)).toBe(true);
    expect(takes('number', PROPERTY_NUMBER_MAX + 1)).toBe(false);
    expect(takes('number', '3')).toBe(false);
  });

  it('is a calendar day, never an instant', () => {
    expect(takes('date', '2026-10-24')).toBe(true);
    expect(takes('date', '2026-02-30')).toBe(false);
    expect(takes('date', '2026-10-24T10:00:00.000Z')).toBe(false);
  });

  it('is someone, by id', () => {
    expect(takes('user', ID)).toBe(true);
    expect(takes('user', 'ada')).toBe(false);
  });

  it('is a box ticked, never one unticked', () => {
    expect(takes('checkbox', true)).toBe(true);
    expect(takes('checkbox', false)).toBe(false);
  });

  it('is given as any of these shapes, or none', () => {
    for (const value of [ID, [ID], 'CUST-42', 3.5, true, null]) {
      expect(issuePropertyRequestSchema.safeParse({ value }).success).toBe(true);
    }
    expect(issuePropertyRequestSchema.safeParse({ value: false }).success).toBe(false);
    expect(issuePropertyRequestSchema.safeParse({ value: { id: ID } }).success).toBe(false);
  });
});

describe('a change of a property in the history', () => {
  const property = { id: ID, name: 'Due' };

  it('keeps the type of the property it changed', () => {
    const change = { type: 'date', property, from: null, to: '2026-10-24' };

    expect(ISSUE_ACTIVITY_PAYLOADS['issue.propertyChanged'].parse(change)).toStrictEqual(change);
    expect(
      ISSUE_ACTIVITY_PAYLOADS['issue.propertyChanged'].safeParse({ ...change, to: 'soon' }).success,
    ).toBe(false);
  });

  it('reads one recorded before properties had types as a list', () => {
    const recorded = { property, from: null, to: { id: OTHER, name: '1.2' } };

    expect(ISSUE_ACTIVITY_PAYLOADS['issue.propertyChanged'].parse(recorded)).toStrictEqual({
      type: 'list',
      ...recorded,
    });
  });

  it('keeps someone by id, and names them in the history', () => {
    const stored = { type: 'user', property, from: null, to: OTHER };
    expect(ISSUE_ACTIVITY_PAYLOADS['issue.propertyChanged'].parse(stored)).toStrictEqual(stored);

    const shown = {
      id: ID,
      type: 'issue.propertyChanged',
      actor: { id: ID, name: 'Ada' },
      createdAt: '2026-10-24T10:00:00.000Z',
      payload: { ...stored, to: { id: OTHER, name: 'Grace' } },
    };
    expect(issueActivitySchema.parse(shown)).toStrictEqual(shown);
  });
});
